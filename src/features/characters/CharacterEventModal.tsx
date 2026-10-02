import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions, stageNames, type CharacterEvent } from "./models";

export function CharacterEventModal({ event, onMeet, onLater }: { event: CharacterEvent; onMeet: () => void; onLater: () => void }) {
  const definition = characterDefinitions.find(item => item.id === event.characterId);
  if (!definition) return null;
  return <div className="characterModalBackdrop" role="presentation"><section className="characterModal" role="dialog" aria-modal="true" aria-labelledby="character-event-title">
    <CharacterVisual definition={definition} stage={event.stage} expression={event.kind === "grow" ? "grow" : "happy"} />
    <h2 id="character-event-title">{event.kind === "unlock" ? "새로운 새싹을 발견했어요!" : `${definition.defaultName}이 한 단계 성장했어요!`}</h2>
    <p>{event.kind === "unlock" ? `${definition.regionLabel}에서 새로운 친구를 만났어요.` : `${stageNames[event.stage]}이 되었어요. 함께한 추억이 자라고 있네요.`}</p>
    <div><button type="button" className="primary" autoFocus onClick={onMeet}>만나보기</button><button type="button" onClick={onLater}>나중에 보기</button></div>
  </section></div>;
}
