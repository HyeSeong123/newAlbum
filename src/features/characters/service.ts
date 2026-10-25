import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../services/tauriMediaService";
import { starterSnapshot, type CharacterSnapshot, type CharacterInteractionSource } from "./models";

const empty: CharacterSnapshot = { characters: [], events: [] };
// The browser preview has no native database. Keep its starter interactions in
// memory; installed apps always read and write the SQLite-backed commands below.
let preview = starterSnapshot();
const clickedToday = new Map<string, string>();
const disturbedToday = new Map<string, { day:string; count:number }>();
function previewCall(command: string, args?: Record<string, unknown>): CharacterSnapshot {
  if (command === "set_main_character") {
    if (preview.characters.some(c => c.id === args?.id)) {
      preview = { ...preview, characters: preview.characters.map(c => ({ ...c, isMain: c.id === args?.id })) };
    }
  } else if (command === "rename_character") {
    const name = String(args?.name || "").trim();
    if ([...name].length > 20 || /[\x00-\x1f\x7f]/.test(name)) throw new Error("이름은 줄바꿈 없이 20자 이내로 입력해 주세요.");
    preview = { ...preview, characters: preview.characters.map(c => c.id === args?.id ? { ...c, customName: name || null } : c) };
  } else if (command === "interact_character") {
    const id = String(args?.id);
    if (!["home","sleep"].includes(String(args?.source)) || !preview.characters.some(c => c.id === id && c.isMain)) throw new Error("홈에서 함께하는 새싹에게 말을 걸어 주세요.");
    const day = new Date().toLocaleDateString();
    if (args?.source === "sleep") {
      if (id !== "gomi") throw new Error("홈에서 자고 있는 고미의 반응만 저장할 수 있어요.");
      const previous = disturbedToday.get(id);
      const count = previous?.day === day ? previous.count : 0;
      if (count < 3) {
        disturbedToday.set(id,{day,count:count+1});
        preview = { ...preview, characters:preview.characters.map(c => c.id === id ? { ...c, affection:Math.max(0,c.affection-1) } : c) };
      }
      return preview;
    }
    if (clickedToday.get(id) !== day) {
      clickedToday.set(id, day);
      preview = { ...preview, characters: preview.characters.map(c => c.id === id ? { ...c, affection: c.affection + 1 } : c) };
    }
  }
  return preview;
}
async function call(command: string, args?: Record<string, unknown>): Promise<CharacterSnapshot> {
  if (!isTauriRuntime()) return previewCall(command, args);
  const result = await invoke<CharacterSnapshot>(command, args);
  return result && Array.isArray(result.characters) && Array.isArray(result.events) ? result : empty;
}
export const syncCharacters = () => call("sync_characters");
export const renameCharacter = (id: string, name: string) => call("rename_character", { id, name });
export const setMainCharacter = (id: string) => call("set_main_character", { id });
export const interactCharacter = (id: string, source: CharacterInteractionSource = "home") => call("interact_character", { id, source });
export const dismissCharacterEvent = (eventId: number) => call("dismiss_character_event", { eventId });
