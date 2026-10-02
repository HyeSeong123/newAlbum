import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../services/tauriMediaService";
import type { CharacterSnapshot } from "./models";

const empty: CharacterSnapshot = { characters: [], events: [] };
async function call(command: string, args?: Record<string, unknown>): Promise<CharacterSnapshot> {
  if (!isTauriRuntime()) return empty;
  const result = await invoke<CharacterSnapshot>(command, args);
  return result && Array.isArray(result.characters) && Array.isArray(result.events) ? result : empty;
}
export const syncCharacters = () => call("sync_characters");
export const renameCharacter = (id: string, name: string) => call("rename_character", { id, name });
export const setMainCharacter = (id: string) => call("set_main_character", { id });
export const interactCharacter = (id: string) => call("interact_character", { id });
export const dismissCharacterEvent = (eventId: number) => call("dismiss_character_event", { eventId });
