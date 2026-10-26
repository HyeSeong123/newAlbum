import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../services/tauriMediaService";
import type { CompanionGeneration } from "./companionLlm";
type ChatReactionStatus = { source: CompanionGeneration["source"]; message: string; phase: "queued" | "running" | "complete" | "cancelled" };
const reactionResults = new Map<string, ChatReactionStatus>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
export const subscribeChatReaction = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function markChatReaction(id: string, phase: "queued" | "running" | "cancelled") {
  if (phase === "queued" && reactionResults.get(id)?.phase === "running") return;
  reactionResults.set(id, { source:"local-rules", phase, message: phase === "cancelled" ? "화면을 벗어나 AI 반응을 멈췄어요." : phase === "queued" ? "최근 행동의 AI 반응을 준비하고 있어요." : "최근 행동에 맞는 새 대사를 만들고 있어요." });
  changed();
}
export function recordChatReaction(id: string, reply: CompanionGeneration) {
  // Only an outcome is retained here, never the prompt, generated text or personal records.
  const message = reply.source === "on-device" ? "최근 터치에서 AI가 새로운 대사를 만들었어요." : reply.message ||
    (reply.failure === "repeated" ? "AI가 앞선 말을 반복해 기본 반응을 보여 줬어요. 다시 터치해 주세요." : "AI가 대사를 완성하지 못해 기본 반응을 보여 줬어요. 다시 터치해 주세요.");
  reactionResults.set(id, { source: reply.source, message, phase:"complete" }); changed();
}
export const lastChatReaction = (id: string) => reactionResults.get(id);
export type ChatModelStatus = {
  phase: "unsupported" | "missing" | "downloading" | "verifying" | "ready" | "generating" | "error";
  supported: boolean; installed: boolean; downloaded: number; total: number; message: string;
  model?: "legacy" | "dialogue" | "missing"; upgradeAvailable?: boolean;
  lastOutcome?: "none" | "running" | "success" | "cancelled" | "error"; lastError?: string; lastAt?: number;
  runtime?: { resident?: boolean; reused?: boolean; loadCount?: number; releaseCount?: number; stage?: string;
    loadMs?: number; contextMs?: number; firstTokenMs?: number; totalMs?: number; generationMs?: number;
    rssBeforeKiB?: number; rssLoadedKiB?: number; rssPeakKiB?: number; rssAfterReleaseKiB?: number };
};
const unsupported: ChatModelStatus = { phase: "unsupported", supported: false, installed: false, downloaded: 0, total: 0,
  message: "AI 반응은 RAM 8GB 이상 Android 스마트폰에서 사용할 수 있어요." };
let releasing: Promise<void> = Promise.resolve();
let stopping: Promise<void> = Promise.resolve();
const settled = () => Promise.all([releasing, stopping]);
export const chatModelStatus = async (): Promise<ChatModelStatus> => { await settled(); return isTauriRuntime() ? invoke("chat_model_status") : unsupported; };
export const downloadChatModel = (): Promise<void> => invoke("download_chat_model");
export const generateChatReply = async (prompt: string, sessionId?: string): Promise<string> => { await settled(); return invoke("generate_chat_reply", { prompt, sessionId }); };
export function stopChatModel(sessionId?: string): Promise<void> {
  // A late session-scoped stop must never overtake the next character's generation.
  const pending = stopping.then(() => isTauriRuntime() ? invoke<void>("stop_chat_model", { sessionId }) : undefined);
  stopping = pending.catch(() => {});
  return pending;
}
export function releaseChatModel(sessionId: string): Promise<void> {
  releasing = releasing.catch(() => {}).then(() => isTauriRuntime() ? invoke<void>("release_chat_model", { sessionId }) : undefined).catch(() => {});
  return releasing;
}
