import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../services/tauriMediaService";
import type { CompanionGeneration } from "./companionLlm";
type ChatReactionStatus = { source: CompanionGeneration["source"]; message: string };
const reactionResults = new Map<string, ChatReactionStatus>();
export function recordChatReaction(id: string, reply: CompanionGeneration) {
  // Only an outcome is retained here, never the prompt, generated text or personal records.
  const message = reply.source === "on-device" ? "최근 터치에서 AI가 새 대사를 만들었어요." : reply.message ||
    (reply.failure === "repeated" ? "AI가 앞선 말을 반복해 기본 반응을 보여 줬어요. 다시 터치해 주세요." : "AI가 대사를 완성하지 못해 기본 반응을 보여 줬어요. 다시 터치해 주세요.");
  reactionResults.set(id, { source: reply.source, message });
}
export const lastChatReaction = (id: string) => reactionResults.get(id);
export type ChatModelStatus = {
  phase: "unsupported" | "missing" | "downloading" | "verifying" | "ready" | "generating" | "error";
  supported: boolean; installed: boolean; downloaded: number; total: number; message: string;
  model?: "legacy" | "dialogue" | "missing"; upgradeAvailable?: boolean;
};
const unsupported: ChatModelStatus = { phase: "unsupported", supported: false, installed: false, downloaded: 0, total: 0,
  message: "AI 반응은 RAM 8GB 이상 Android 스마트폰에서 사용할 수 있어요." };
export const chatModelStatus = (): Promise<ChatModelStatus> => isTauriRuntime() ? invoke("chat_model_status") : Promise.resolve(unsupported);
export const downloadChatModel = (): Promise<void> => invoke("download_chat_model");
export const generateChatReply = (prompt: string): Promise<string> => invoke("generate_chat_reply", { prompt });
export const stopChatModel = (): Promise<void> => isTauriRuntime() ? invoke("stop_chat_model") : Promise.resolve();
