import { CharacterVisual } from "./CharacterVisual";
import { growthProgress, growthStage, growthStageName, stageNames, type CharacterDefinition, type OwnedCharacter } from "./models";

export function CharacterGrowth({ definition, owned, characters }: {
  definition: CharacterDefinition; owned: OwnedCharacter; characters: OwnedCharacter[];
}) {
  const progress = growthProgress(definition, owned, characters);
  return <div className="characterGrowth">
    <p className="characterGrowthState">{stageNames[owned.growthStage]} · {growthStageName(definition, owned.growthStage)}</p>
    {!progress.ready ? <p className="characterGrowthWaiting">{progress.prerequisiteName}을 완성하면 키울 수 있어요. 지금은 곁에서 응원하며 기다려요.</p>
      : progress.complete ? <p className="characterGrowthComplete">고유한 모습으로 완성했어요. 앞으로도 추억을 함께 모아요.</p>
      : <div className="characterGrowthProgress"><label htmlFor={`growth-progress-${definition.id}`}>{growthStageName(definition, progress.nextStage)}까지 {definition.regionLabel} GPS 사진 {progress.remaining}장</label>
        <progress id={`growth-progress-${definition.id}`} max={progress.target} value={Math.min(progress.count, progress.target)} />
        <small>{progress.count} / {progress.target}장{definition.growthPrerequisite ? " · 감자 완성 뒤부터 모은 사진" : ""}</small></div>}
    <details className="characterGrowthJourney"><summary>고유 성장 과정 보기</summary>
      <ol>{definition.growthStages.map((item, index) => <li key={item.name} aria-current={owned.growthStage === index + 1 ? "step" : undefined}>
        <CharacterVisual definition={definition} stage={index + 1} />
        <span>{stageNames[index + 1]}</span><strong>{item.name}</strong>
      </li>)}</ol>
      <p>{growthStage(definition, owned.growthStage).description}</p>
      <ul className="characterGrowthDescriptions">{definition.growthStages.map(item => <li key={item.name}><strong>{item.name}</strong> — {item.description}</li>)}</ul>
    </details>
  </div>;
}
