import { useEffect, useRef, useState } from "react";
import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions, characterName, companionLabel, dialogueLines, nextDialogue, stageNames, type OwnedCharacter } from "./models";
import "./characters.css";

type Props = {
  characters: OwnedCharacter[]; onRename: (id: string, name: string) => Promise<boolean>;
  onSetMain: (id: string) => Promise<unknown>; onInteract: (id: string) => Promise<unknown>;
};
export function CharacterBook({ characters, onRename, onSetMain, onInteract }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [spoken, setSpoken] = useState<{ id: string; index: number; happy: boolean } | null>(null);
  const lastLines = useRef<Record<string, number>>({});
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <section className="characterBook" aria-label="새싹 도감">
    <header className="characterBookIntro"><h2>함께 기록하고, 여행길에서 만나는 새싹들</h2><p>동생 감자싹과 형 고구마싹은 처음부터 함께해요. 다른 친구들은 그 지역에서 찍은 GPS 사진을 등록하면 만날 수 있어요.</p><p>감자싹은 사용법을 알려주고, 고구마싹은 작은 기록을 응원해요. 새싹들은 각 지역의 GPS 사진이 10장, 30장, 60장 쌓일 때 자라요.</p><span>{characters.length} / {characterDefinitions.length} 친구</span></header>
    <div className="characterGrid">{characterDefinitions.map(def => {
      const owned = characters.find(item => item.id === def.id);
      const name = characterName(def, owned);
      return <article key={def.id} className={`characterCard${owned ? "" : " locked"}`}>
        <div className="characterCardArt">{owned ? <button type="button" aria-label={`${name}에게 말 걸기`} onClick={() => {
          const lines = dialogueLines(def, owned.growthStage, owned.affection >= 20 ? "highAffection" : "idle");
          const index = nextDialogue(lines, lastLines.current[def.id] ?? 0);
          lastLines.current[def.id] = index;
          setSpoken({ id: def.id, index, happy: true });
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setSpoken(current => current?.id === def.id ? { ...current, happy: false } : current), 1000);
          void onInteract(def.id);
        }}><CharacterVisual definition={def} stage={owned.growthStage} expression={spoken?.id === def.id && spoken.happy ? "happy" : "idle"} /></button> : <span className="characterSilhouette" aria-hidden="true">?</span>}</div>
        <span className="characterRegion">{companionLabel(def)}</span>
        <h3>{owned ? name : "????"}</h3>
        {owned ? <>
          {spoken?.id === def.id && <p className="characterDialogue" role="status">{dialogueLines(def, owned.growthStage, owned.affection >= 20 ? "highAffection" : "idle")[spoken.index]}</p>}
          <p>{def.description}</p><p className="characterStats">{stageNames[owned.growthStage]} · {def.defaultUnlocked ? `${def.regionLabel} ` : ""}추억 {owned.regionPhotoCount}장 · 친밀도 {owned.affection}</p>
          <div className="characterCardActions">
            {owned.isMain ? <span className="characterMainBadge">대표 새싹</span> : <button type="button" onClick={() => void onSetMain(def.id)}>대표로 설정</button>}
            <button type="button" onClick={() => { setDraft(owned.customName || ""); setEditing(def.id); }}>이름 바꾸기</button>
          </div>
          {editing === def.id && <form onSubmit={event => { event.preventDefault(); void onRename(def.id, draft).then(saved => { if (saved) setEditing(null); }); }}>
            <label htmlFor={`character-name-${def.id}`}>새싹 이름</label><input id={`character-name-${def.id}`} maxLength={20} value={draft} placeholder={def.defaultName} onChange={event => setDraft(event.target.value)} />
            <button type="submit">저장</button><button type="button" onClick={() => setEditing(null)}>취소</button>
          </form>}
        </> : <p>{def.regionLabel}에서 찍은 GPS 사진을 등록하면 만날 수 있어요.</p>}
      </article>;
    })}</div>
  </section>;
}
