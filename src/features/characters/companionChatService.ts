import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../services/tauriMediaService";
export type ChatModelStatus = {
  phase: "unsupported" | "missing" | "downloading" | "verifying" | "ready" | "generating" | "error";
  supported: boolean; installed: boolean; downloaded: number; total: number; message: string;
};
const unsupported: ChatModelStatus = { phase: "unsupported", supported: false, installed: false, downloaded: 0, total: 0,
  message: "AI 반응은 RAM 8GB 이상 Android 스마트폰에서 사용할 수 있어요." };
export const chatModelStatus = (): Promise<ChatModelStatus> => isTauriRuntime() ? invoke("chat_model_status") : Promise.resolve(unsupported);
export const downloadChatModel = (): Promise<void> => invoke("download_chat_model");
export const generateChatReply = (prompt: string): Promise<string> => invoke("generate_chat_reply", { prompt });
export const stopChatModel = (): Promise<void> => isTauriRuntime() ? invoke("stop_chat_model") : Promise.resolve();
