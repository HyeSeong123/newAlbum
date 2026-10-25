import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterSnapshot, CharacterInteractionSource } from "./models";
import * as service from "./service";

export function useCharacters(mediaRevision: string) {
  const [snapshot, setSnapshot] = useState<CharacterSnapshot>({ characters: [], events: [] });
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const refresh = useCallback(async () => {
    await writes.current;
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
  const change = (request: () => Promise<CharacterSnapshot>) => {
    const result = writes.current.then(async () => {
      ++sequence.current;
      try {
        const next = await request();
        ++sequence.current; setSnapshot(next); setError(""); return next;
      } catch (cause) {
        ++sequence.current;
        setError(cause instanceof Error ? cause.message : "새싹 정보를 저장하지 못했습니다.");
        return undefined;
      }
    });
    writes.current = result;
    return result;
  };
  return { snapshot, error, refresh,
    rename: (id: string, name: string) => change(() => service.renameCharacter(id, name)).then(Boolean),
    setMain: (id: string) => change(() => service.setMainCharacter(id)).then(Boolean),
    interact: async (id: string, source: CharacterInteractionSource = "home") => (await change(() => service.interactCharacter(id, source)))?.characters.find(c => c.id === id),
    dismiss: (eventId: number) => change(() => service.dismissCharacterEvent(eventId)).then(Boolean),
  };
}
