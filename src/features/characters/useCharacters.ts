import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterSnapshot } from "./models";
import * as service from "./service";

export function useCharacters(mediaRevision: string) {
  const [snapshot, setSnapshot] = useState<CharacterSnapshot>({ characters: [], events: [] });
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const result = await service.syncCharacters();
      if (ticket === sequence.current) { setSnapshot(result); setError(""); }
    } catch { if (ticket === sequence.current) setError("새싹 도감을 불러오지 못했습니다. 다시 시도해 주세요."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, mediaRevision]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  const change = async (request: () => Promise<CharacterSnapshot>) => {
    ++sequence.current;
    try { setSnapshot(await request()); setError(""); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "새싹 정보를 저장하지 못했습니다."); return false; }
  };
  return { snapshot, error, refresh,
    rename: (id: string, name: string) => change(() => service.renameCharacter(id, name)),
    setMain: (id: string) => change(() => service.setMainCharacter(id)),
    interact: (id: string) => change(() => service.interactCharacter(id)),
    dismiss: (eventId: number) => change(() => service.dismissCharacterEvent(eventId)),
  };
}
