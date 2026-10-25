import type { CharacterDefinition, OwnedCharacter } from "./models";
import { buildCompanionPrompt, type CompanionAction, type CompanionMemory } from "./companionActivities";
import { cleanCompanionGeneratedText, type CompanionGeneration } from "./companionLlm";

export type TouchContext = {
  definition: CharacterDefinition; owned: OwnedCharacter; memory: CompanionMemory;
  action: CompanionAction | "touch"; fallback: string; previous: string[]; hour: number; appearance?: string;
};
const plain = (value: string) => value.replace(/<\|[^>]*\|>/g, "").replace(/<\/?think>/gi, "");
export function buildTouchPrompt(context: TouchContext): string {
  const { definition, owned, memory, action, fallback, previous, hour } = context;
  const base = buildCompanionPrompt(definition, owned, memory, action === "touch" ? "pet" : action);
  const period = hour < 6 || hour >= 22 ? "밤" : hour < 12 ? "아침" : hour < 18 ? "오후" : "저녁";
  const system = [base.system,
    "사용자는 글을 입력하지 않았다. 홈 캐릭터를 터치하거나 함께하기 행동을 고른 상황이다.",
    "현재 시간대: " + period,
    "현재 외형: " + (context.appearance || definition.description),
    "현재 외형에 없는 신체 부위(잎·뿌리 등)를 지어내지 않는다.",
    "지금 표정과 행동에 맞는 반응: " + fallback,
    "최근 했던 말(그대로 반복하지 말기): " + previous.slice(-5).join(" / "),
    "현재 반응의 감정과 상황은 지키되, 자연스러운 혼잣말이나 짧은 인사 1~2문장을 새로 만든다. 70자 이내.",
    "고미가 졸리거나 귀찮아하는 반응이면 그 상태를 유지한다. 낮은 친밀도에서 갑자기 살갑게 굴지 않는다.",
    "앞뒤 설명 없이 캐릭터가 하는 말만 출력한다. /no_think"].map(plain).join("\n");
  const user = action === "touch" ? "사용자가 지금 나를 살짝 터치했다. 지금 기분과 관계에 어울리는 새 말을 해." : base.user;
  return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\n" + plain(user) +
    " /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
}
const normalized = (line: string) => line.replace(/[\s.!?…~。！？]/g, "");
export async function generateTouchLine(context: TouchContext, generator: (prompt: string, signal?: AbortSignal) => Promise<string>, signal?: AbortSignal): Promise<CompanionGeneration> {
  const fallback: CompanionGeneration = { source: "local-rules", line: context.fallback };
  if (signal?.aborted) return fallback;
  try {
    const line = cleanCompanionGeneratedText(await generator(buildTouchPrompt(context), signal));
    if (!signal?.aborted && line && !context.previous.some(previous => normalized(previous) === normalized(line))) return { source: "on-device", line };
  } catch { /* A missing model or cancellation keeps the immediate character reaction. */ }
  return fallback;
}
const KEY = "gamjassak:reaction-lines:v1:";
const sessions = new Map<string, string[]>();
function storage(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }
export function recentTouchLines(id: string, store: Pick<Storage, "getItem"> | undefined = storage()): string[] {
  const cached = sessions.get(id);
  if (cached) return cached;
  try {
    const value = JSON.parse(store?.getItem(KEY + encodeURIComponent(id)) || "null");
    if (Array.isArray(value)) return value.filter(line => typeof line === "string" && line.length <= 100).slice(-12);
  } catch { /* Corrupted optional memory must not affect the character. */ }
  return sessions.get(id) || [];
}
export function rememberTouchLine(id: string, line: string, store: Pick<Storage, "getItem" | "setItem"> | undefined = storage()) {
  const lines = [...recentTouchLines(id, store), line].slice(-12);
  sessions.set(id, lines);
  try { store?.setItem(KEY + encodeURIComponent(id), JSON.stringify(lines)); } catch { /* Keep session-only variety. */ }
}

// One inference at a time. A new touch aborts old work and queues only the latest context.
export function createTouchReactionQueue(
  generate: (context: TouchContext, signal: AbortSignal) => Promise<CompanionGeneration>,
  publish: (reply: CompanionGeneration, context: TouchContext) => void,
  onBusy: (busy: boolean) => void, delay = 600,
) {
  let queued: { context: TouchContext; revision: number; at: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let revision = 0, running = false, disposed = false;
  function schedule() {
    clearTimeout(timer);
    if (!disposed && queued) timer = setTimeout(() => void run(), Math.max(0, queued.at + delay - Date.now()));
  }
  async function run() {
    if (disposed || running || !queued) return;
    const job = queued; queued = undefined; running = true;
    const signal = new AbortController(); controller = signal;
    onBusy(true);
    try {
      const reply = await generate(job.context, signal.signal);
      if (!disposed && !signal.signal.aborted && job.revision === revision) publish(reply, job.context);
    } catch { /* UI has already shown the immediate reaction. */ }
    finally { controller = undefined; running = false; if (!disposed) { onBusy(false); schedule(); } }
  }
  function cancel() {
    ++revision; queued = undefined; clearTimeout(timer); controller?.abort();
    if (!disposed) onBusy(false);
  }
  return {
    enqueue(context: TouchContext) {
      if (disposed) return;
      queued = { context, revision: ++revision, at: Date.now() };
      controller?.abort(); schedule();
    },
    cancel,
    dispose() { cancel(); disposed = true; },
  };
}
