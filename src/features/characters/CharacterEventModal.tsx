import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions, characterName, type CharacterEvent, type OwnedCharacter } from "./models";

export function CharacterEventModal({ event, owned, onMeet, onLater }: { event: CharacterEvent; owned?: OwnedCharacter; onMeet: () => void; onLater: () => void }) {
  const definition = characterDefinitions.find(item => item.id === event.characterId);
  if (!definition) return null;
  const name = characterName(definition, owned);
  return <div className="characterModalBackdrop" role="presentation"><section className="characterModal" role="dialog" aria-modal="true" aria-labelledby="character-event-title">
    <CharacterVisual definition={definition} stage={event.stage} expression={event.kind === "grow" ? "grow" : "happy"} />
    <h2 id="character-event-title">{event.kind === "unlock" ? "새로운 새싹을 발견했어요!" : event.stage === definition.maxStage ? `${name} · 성장을 마쳤어요!` : `${name} · 한 단계 성장했어요!`}</h2>
    <p>{event.kind === "unlock" ? "우리의 하루에 작은 친구가 찾아왔어요. 이름을 지어 줄까요?" : `${event.stage}단계에 도달했어요. 함께한 시간이 작은 변화를 만들었네요.`}</p>
    <div><button type="button" className="primary" autoFocus onClick={onMeet}>만나보기</button><button type="button" onClick={onLater}>나중에 보기</button></div>
  </section></div>;
}
