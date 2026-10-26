import type { CharacterDefinition, OwnedCharacter } from "./models";
import { buildCompanionPrompt, type CompanionAction, type CompanionMemory } from "./companionActivities";

// Native inference is deliberately injected, never started by a Home render.
// Android builds without a verified llama.cpp/JNI engine keep the local rules.
export type OnDeviceCompanionGenerator = (prompt: { system: string; user: string }, signal?: AbortSignal) => Promise<string>;
export type CompanionGeneration = { source: "on-device" | "local-rules"; line: string;
  failure?: "invalid" | "repeated" | "execution"; message?: string };
export function cleanCompanionGeneratedText(text: string): string {
  const spoken = text.replace(/^\s*<\|im_start\|>assistant\s*\n/i, "");
  if (/^\s*(?:user|system|developer|사용자|시스템)\s*[:：]/i.test(spoken)) return "";
  const boundary = spoken.search(/<\|[^>]+\|>|\n\s*(?:user|system|developer|assistant|사용자|시스템)\s*[:：]/i);
  const currentRole = (boundary < 0 ? spoken : spoken.slice(0, boundary))
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "");
  const closingThought = currentRole.toLowerCase().lastIndexOf("</think>");
  const result = (closingThought < 0 ? currentRole : currentRole.slice(closingThought + 8))
    .replace(/^\s*(?:assistant|캐릭터)\s*[:：]\s*/i, "")
    .replace(/[\r\n]+/g, " ").trim();
  if (result.length < 2) return "";
  const sentences = result.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu) || [result];
  let line = "";
  for (const sentence of sentences.slice(0, 2)) {
    const next = [line, sentence.trim()].filter(Boolean).join(" ");
    if (Array.from(next).length > 100) break;
    line = next;
  }
  // A complete first sentence is useful even when the model exceeds its length instruction.
  return line || Array.from(result).slice(0, 99).join("") + "…";
}
export function companionExecutionError(cause: unknown): string {
  const message = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "";
  if (/AI_LOAD_TIMEOUT/.test(message)) return "AI 모델을 불러오는 시간이 길어 기본 반응을 보여 줬어요.";
  if (/AI_GENERATION_TIMEOUT/.test(message)) return "AI 대사 생성 시간이 길어 기본 반응을 보여 줬어요.";
  if (/AI_ENGINE|실행기/.test(message)) return "AI 실행기를 불러오지 못했어요. 앱 업데이트를 확인해 주세요.";
  if (/메모리|다른 앱|memory/i.test(message)) return "메모리가 부족해 AI 대사를 만들지 못했어요. 다른 앱을 잠시 닫고 다시 터치해 주세요.";
  if (/실행기|불러오지|load/i.test(message)) return "AI를 불러오지 못했어요. 앱을 다시 연 뒤 터치해 주세요.";
  if (/오래 걸|시간.*초과|timeout/i.test(message)) return "AI 대사를 만드는 시간이 길어 중단됐어요. 잠시 후 다시 터치해 주세요.";
  if (/진행 중|이전 대답|마무리/i.test(message)) return "앞선 AI 대사를 마무리하고 있어요. 잠시 후 다시 터치해 주세요.";
  return "AI 대사를 만들지 못해 기본 반응을 보여 줬어요. 다시 터치해 주세요.";
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
