import type { CharacterDefinition, OwnedCharacter } from "./models";
import { buildCompanionPrompt, type CompanionAction, type CompanionMemory } from "./companionActivities";

// Native inference is deliberately injected, never started by a Home render.
// Android builds without a verified llama.cpp/JNI engine keep the local rules.
export type OnDeviceCompanionGenerator = (prompt: { system: string; user: string }, signal?: AbortSignal) => Promise<string>;
export type CompanionGeneration = { source: "on-device" | "local-rules"; line: string };
export function cleanCompanionGeneratedText(text: string): string {
  const result = text.replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\|[^>]+\|>/g, "")
    .replace(/^\s*(?:assistant|캐릭터)\s*[:：]\s*/i, "")
    .replace(/[\r\n]+/g, " ").trim();
  return result.length <= 100 && result.length >= 2 ? result : "";
}
export async function generateCompanionLine(definition: CharacterDefinition, owned: OwnedCharacter, memory: CompanionMemory,
  action: CompanionAction, fallback: string, generator?: OnDeviceCompanionGenerator,
  signal?: AbortSignal): Promise<CompanionGeneration> {
  if (!generator || signal?.aborted) return { source: "local-rules", line: fallback };
  try {
    const output = await generator(buildCompanionPrompt(definition, owned, memory, action), signal);
    if (signal?.aborted) return { source: "local-rules", line: fallback };
    const line = cleanCompanionGeneratedText(output);
    if (line) return { source: "on-device", line };
  } catch { /* Missing model, inference failure or cancellation must not block interacting. */ }
  return { source: "local-rules", line: fallback };
}
