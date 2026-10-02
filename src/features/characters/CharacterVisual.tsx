import type { CharacterDefinition } from "./models";

export type Expression = "idle" | "happy" | "sad" | "grow";
export function CharacterVisual({ definition, stage, expression = "idle", className = "" }: {
  definition: CharacterDefinition; stage: number; expression?: Expression; className?: string;
}) {
  return <img className={`characterVisual ${className}`} src={`${definition.assetPath}/stage${Math.max(1, Math.min(4, stage))}-${expression}.svg`}
    alt="" draggable={false} width={220} height={220} />;
}
