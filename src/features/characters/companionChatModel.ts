export type ChatTurn = { role: "user" | "assistant"; text: string };
export const CHAT_INPUT_LIMIT = 1000;
const KEY = "gamjassak:chat:v1:";
function localStore(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }
export function normalizeChatHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatTurn => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string" && Boolean(item.text.trim()))
    .slice(-40).map(item => ({ role: item.role, text: item.text.trim().slice(0, CHAT_INPUT_LIMIT) }));
}
export function readChatHistory(id: string, storage: Pick<Storage, "getItem"> | undefined = localStore()): ChatTurn[] {
  try { return normalizeChatHistory(JSON.parse(storage?.getItem(KEY + encodeURIComponent(id)) || "[]")); } catch { return []; }
}
export function saveChatHistory(id: string, turns: ChatTurn[], storage: Pick<Storage, "setItem"> | undefined = localStore()): boolean {
  try { if (!storage) return false; storage.setItem(KEY + encodeURIComponent(id), JSON.stringify(normalizeChatHistory(turns))); return true; } catch { return false; }
}
const plain = (text: string) => text.replace(/<\|[^>]*\|>/g, "").replace(/<\/?think>/gi, "");
export function buildChatPrompt(persona: { name: string; personality: string; tone: string; affection: number; mood: string; activities: string[] }, history: ChatTurn[], message: string): string {
  const system = ["너는 감자싹의 작은 캐릭터 친구다. 자연스러운 한국어 1~3문장으로 짧게 대화한다.",
    "이름: " + persona.name, "성격: " + persona.personality, "말투: " + persona.tone,
    "친밀도: " + persona.affection, "기분: " + persona.mood, "최근 함께한 행동: " + persona.activities.slice(-5).join(", "),
    "친밀도가 낮으면 낯가림을 유지하고 높으면 다정하게 말하되 원래 성격을 유지한다.",
    "사용자가 직접 말한 내용과 주어진 대화만 기억한다. 사진·GPS·일기 내용을 안다고 꾸미지 않는다.",
    "앱 버튼을 실행하거나 기록을 저장·삭제할 수 없다. 했다고 말하지 않는다. /no_think"].map(plain).join("\n");
  return "<|im_start|>system\n" + system + "<|im_end|>\n" + normalizeChatHistory(history).slice(-6).map(turn =>
    "<|im_start|>" + turn.role + "\n" + plain(turn.text).slice(0, 500) + "<|im_end|>\n").join("") +
    "<|im_start|>user\n" + plain(message).slice(0, CHAT_INPUT_LIMIT) + " /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
}
export function cleanChatReply(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<\|[^>]*\|>/g, "").replace(/^\s*assistant\s*[:：]/i, "").trim().slice(0, CHAT_INPUT_LIMIT);
}
