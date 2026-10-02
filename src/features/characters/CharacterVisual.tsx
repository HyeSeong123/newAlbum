import type { CharacterDefinition } from "./models";

export type Expression = "idle" | "happy" | "sad" | "grow";
export function CharacterVisual({ definition, stage, expression = "idle", className = "" }: {
  definition: CharacterDefinition; stage: number; expression?: Expression; className?: string;
}) {
  const animation = definition.personality?.signatureAnimation || "default";
  return <img
    className={`characterVisual characterVisual--${definition.type} characterMotion--${animation} ${className}`.trim()}
    data-character={definition.type}
    data-stage={Math.max(1, Math.min(4, stage))}
    data-expression={expression}
    src={definition.originalAssetPath || `${definition.assetPath}/stage${Math.max(1, Math.min(4, stage))}-${expression}.svg`}
    alt="" draggable={false} width={220} height={220}
  />;
}
