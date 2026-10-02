import { useEffect, useRef, useState } from "react";
import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions, characterName, nextDialogue, stageNames, type OwnedCharacter } from "./models";
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
    <header className="characterBookIntro"><h2>여행길에서 만난 새싹들</h2><p>그곳에서 찍은 사진을 남기면 작은 친구를 만날 수 있어요. GPS가 담긴 사진만 발견 기록으로 이어져요.</p><span>{characters.length} / {characterDefinitions.length} 친구</span></header>
    <div className="characterGrid">{characterDefinitions.map(def => {
      const owned = characters.find(item => item.id === def.id);
      const name = characterName(def, owned);
      return <article key={def.id} className={`characterCard${owned ? "" : " locked"}`}>
        <div className="characterCardArt">{owned ? <button type="button" aria-label={`${name}에게 말 걸기`} onClick={() => {
          const lines = [...def.dialogues.all, ...(def.dialogues.stages[String(owned.growthStage)] || [])];
          const index = nextDialogue(lines, lastLines.current[def.id] ?? 0);
          lastLines.current[def.id] = index;
          setSpoken({ id: def.id, index, happy: true });
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setSpoken(current => current?.id === def.id ? { ...current, happy: false } : current), 1000);
          void onInteract(def.id);
        }}><CharacterVisual definition={def} stage={owned.growthStage} expression={spoken?.id === def.id && spoken.happy ? "happy" : "idle"} /></button> : <span className="characterSilhouette" aria-hidden="true">?</span>}</div>
        <span className="characterRegion">{def.regionLabel}</span>
        <h3>{owned ? name : "????"}</h3>
        {owned ? <>
          {spoken?.id === def.id && <p className="characterDialogue" role="status">{[...def.dialogues.all, ...(def.dialogues.stages[String(owned.growthStage)] || [])][spoken.index]}</p>}
          <p>{def.description}</p><p className="characterStats">{stageNames[owned.growthStage]} · 추억 {owned.regionPhotoCount}장 · 친밀도 {owned.affection}</p>
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
