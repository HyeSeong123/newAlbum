import {ownAiStatus, stopOwnAi} from "./ownAi/client";
import type { CompanionGeneration } from "./companionLlm";
type ChatReactionStatus = { source: CompanionGeneration["source"]; message: string; phase: "queued" | "running" | "complete" | "cancelled" };
const reactionResults = new Map<string, ChatReactionStatus>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
export const subscribeChatReaction = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function markChatReaction(id: string, phase: "queued" | "running" | "cancelled") {
  if (phase === "queued" && reactionResults.get(id)?.phase === "running") return;
  reactionResults.set(id, { source:"local-rules", phase, message: phase === "cancelled" ? "AI 반응을 멈췄어요." : phase === "queued" ? "최근 행동의 AI 반응을 준비하고 있어요." : "최근 행동에 맞는 새 대사를 만들고 있어요." });
  changed();
}
export function recordChatReaction(id: string, reply: CompanionGeneration) {
  // Only an outcome is retained here, never the prompt, generated text or personal records.
  const message = reply.source === "on-device" ? "최근 터치에서 AI가 새로운 대사를 만들었어요." : reply.message ||
    (reply.failure === "repeated" ? "AI가 앞선 말을 반복했어요. 새 대사를 다시 요청해 주세요." : "AI 대사 생성에 실패했어요. 친구를 다시 터치해 주세요.");
  reactionResults.set(id, { source: reply.source, message, phase:"complete" }); changed();
}
export const lastChatReaction = (id: string) => reactionResults.get(id);
export type ChatModelStatus = {
  phase: "unsupported" | "missing" | "downloading" | "verifying" | "ready" | "generating" | "error";
  supported: boolean; installed: boolean; downloaded: number; total: number; message: string;
  model?: "legacy" | "dialogue" | "gomi-action-v3" | "own-character-v3" | "missing"; upgradeAvailable?: boolean; bundled?: boolean;
  lastOutcome?: "none" | "running" | "success" | "cancelled" | "error"; lastError?: string; lastAt?: number;
  runtime?: { resident?: boolean; reused?: boolean; loadCount?: number; releaseCount?: number; stage?: string; gomiLoraApplied?: boolean; gomiActionApplied?: boolean; ownModelApplied?: boolean;
    gpuAvailable?: boolean; gpuAttempted?: boolean; gpuUsed?: boolean; gpuLayers?: number; gpuFallback?: boolean;
    loadMs?: number; contextMs?: number; promptMs?: number; promptTokens?: number; cachedPromptTokens?: number; contextReused?: boolean;
    firstTokenMs?: number; totalMs?: number; generationMs?: number;
    rssBeforeKiB?: number; rssLoadedKiB?: number; rssPeakKiB?: number; rssAfterReleaseKiB?: number };
};
const unsupported: ChatModelStatus = { phase: "unsupported", supported: false, installed: false, downloaded: 0, total: 0,
  message: "곰고미 AI는 홈의 행동 반응에서 사용할 수 있어요." };
export const chatModelStatus = async (characterId?: string, usage?: "home-actions"): Promise<ChatModelStatus> => {
  return characterId && usage === "home-actions" ? ownAiStatus() as ChatModelStatus : unsupported;
};
export const downloadChatModel = (): Promise<void> => Promise.reject(new Error("AI_EXTERNAL_MODELS_DISABLED"));
export const generateChatReply = async (_prompt: string, _sessionId?: string, _characterId?: string, _usage?: "home-actions"): Promise<string> => {
  throw new Error("AI_ACTIONS_ONLY");
};
export function stopChatModel(_sessionId?: string): Promise<void> {
  stopOwnAi();return Promise.resolve();
}
export function releaseChatModel(_sessionId: string): Promise<void> {
  stopOwnAi();return Promise.resolve();
}
