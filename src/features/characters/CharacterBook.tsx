import { useState } from "react";
import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions, characterName, characterDescription, type OwnedCharacter } from "./models";
import "./characters.css";

type Props = {
  characters: OwnedCharacter[]; onRename: (id: string, name: string) => Promise<boolean>;
  onSetMain: (id: string) => Promise<unknown>;
};
export function CharacterBook({ characters, onRename, onSetMain }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return <section className="characterBook" aria-label="새싹 도감">
    <header className="characterBookIntro"><h2>함께 자라는 작은 친구들</h2><p>오늘의 모습을 간직해요. 다음 만남에는 어떤 표정으로 인사할까요?</p></header>
    <div className="characterGrid">{characterDefinitions.map(def => {
      const owned = characters.find(item => item.id === def.id);
      const name = characterName(def, owned);
      return <article key={def.id} className={`characterCard${owned ? "" : " locked"}`}>
        <div className="characterCardArt" role="img" aria-label={owned ? `${name}의 현재 모습` : "아직 만나지 않은 친구"}>
          {owned ? <CharacterVisual definition={def} stage={owned.growthStage} affection={owned.affection} /> : <span className="characterMystery" aria-hidden="true">?</span>}
        </div>
        <h3>{owned ? name : "아직 만나지 않은 친구"}</h3>
        {owned ? <>
          <p className="characterDescription">{characterDescription(def, owned)}</p>
          <div className="characterCardActions">
            {owned.isMain ? <span className="characterMainBadge">대표 새싹</span> : <button type="button" onClick={() => void onSetMain(def.id)}>대표로 설정</button>}
            <button type="button" onClick={() => { setDraft(owned.customName || ""); setEditing(def.id); }}>이름 바꾸기</button>
          </div>
          {editing === def.id && <form onSubmit={event => { event.preventDefault(); void onRename(def.id, draft).then(saved => { if (saved) setEditing(null); }); }}>
            <label htmlFor={`character-name-${def.id}`}>새싹 이름</label><input id={`character-name-${def.id}`} maxLength={20} value={draft} placeholder={def.defaultName} onChange={event => setDraft(event.target.value)} />
            <button type="submit">저장</button><button type="button" onClick={() => setEditing(null)}>취소</button>
          </form>}
        </> : <p className="characterDescription">어느 날, 작은 친구가 찾아올 거예요.</p>}
      </article>;
    })}</div>
  </section>;
}
