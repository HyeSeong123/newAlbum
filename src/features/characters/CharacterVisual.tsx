import type { CharacterDefinition } from "./models";
import { PotatoGrowthVisual } from "./PotatoGrowthVisual";

export type Expression = "idle" | "happy" | "sad" | "grow";
export function CharacterVisual({ definition, stage, expression = "idle", className = "" }: {
  definition: CharacterDefinition; stage: number; expression?: Expression; className?: string;
}) {
  const animation = definition.personality?.signatureAnimation || "default";
  const visualClass = `characterVisual characterVisual--${definition.type} characterMotion--${animation} ${className}`.trim();
  const currentStage = Math.max(1, Math.min(4, stage));
  if (definition.originalAssetPath && currentStage < 4) {
    return <PotatoGrowthVisual src={definition.originalAssetPath} stage={currentStage} expression={expression} className={visualClass} />;
  }
  return <img
    className={visualClass}
    data-character={definition.type}
    data-stage={Math.max(1, Math.min(4, stage))}
    data-expression={expression}
    src={definition.originalAssetPath || `${definition.assetPath}/stage${Math.max(1, Math.min(4, stage))}-${expression}.svg`}
    alt="" draggable={false} width={220} height={220}
  />;
}
