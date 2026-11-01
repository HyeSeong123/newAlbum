import type { CharacterDefinition, OwnedCharacter } from "./models";
import { companionActionLabel, companionMoodLabel, type CompanionAction, type CompanionMemory } from "./companionActivities";
import { gomiAffinity } from "./gomiAffinity";
import { cleanCompanionGeneratedText, companionExecutionError, type CompanionGeneration } from "./companionLlm";

export type TouchContext = {
  definition: CharacterDefinition; owned: OwnedCharacter; memory: CompanionMemory;
  action: CompanionAction | "touch"; fallback: string; previous: string[]; hour: number; appearance?: string;
};
const plain = (value: string) => value.replace(/<\|[^>]*\|>/g, "").replace(/<\/?think>/gi, "");
// Instructions for the actual Home gesture; training-only life scenes must not be
// invented as if this app observed a walk, illness, guest, meal or homecoming.
const gomiGestureIntent: Record<CompanionAction | "touch", string> = {
  touch: "집사가 고미에게 관심을 보였다. 고미가 원하는 관심·거리·요구를 짧게 말하되 이유 없는 짜증만 내지 않는다.",
  walk: "산책을 좋아해서 집사를 재촉한다. 목줄을 채우는 과정은 귀찮아할 수 있지만 산책 자체를 싫어한다고 하지 않는다.",
  treat: "간식을 고미가 원하는 방식으로 달라고 할 수 있다. 실제로 먹었다고 단정하지 않는다.",
  pet: "허락하거나 고개를 피할 수 있다. 집사 손길에 대한 지금의 기분을 말하되 매번 거절하지 않는다.",
  play: "고미가 하고 싶은 놀이에는 적극적이다. 놀이 자체가 무조건 귀찮다고 하지 않는다.",
  rest: "자기 자리와 집사 옆자리를 당당히 요구한다. 쉬는 동안 필요한 것을 말할 수 있다.",
};
export function buildTouchPrompt(context: TouchContext): string {
  const { definition, owned, memory, action, previous, hour } = context;
  const period = hour < 6 || hour >= 22 ? "밤" : hour < 12 ? "아침" : hour < 18 ? "오후" : "저녁";
  const relation = ["아직 낯선 사이", "아직 서먹한 사이", "서로 익숙한 사이", "가까운 사이", "아주 친밀한 사이"][gomiAffinity(owned.affection)];
  const activity = action === "touch" ? "나를 살짝 터치하기" : companionActionLabel(definition, action);
  // A short, stable prefix is reused by native llama.cpp KV caching across
  // Home gestures. Keep only app-observed state in the changing suffix.
  if (definition.type === "gomi") {
    const system = [
      "너는 곰고미의 강아지 고미다. 집사를 좋아하지만 고집이 세고 귀찮은 건 피한다. 원하는 것은 당당히 요구하고 재촉한다.",
      "산책은 좋아하지만 목줄은 피한다. 밥그릇에는 직접 가며 숟가락질은 집사에게 맡긴다. 손님은 무서워서가 아니라 귀찮아서 자리를 피한다. 추우면 집사에게 안아 달라고 한다.",
      "고미의 말투: 짧고 자연스러운 반말. 친해져도 자기주장은 유지한다. 한숨과 '귀찮아'는 가끔만 쓴다. 같은 대사 반복, 지문, 이모지, 설정 설명 금지.",
      "실제 현실의 산책·외출·방문객·식사·건강·배변 사건은 감지하지 못한다. 사진·일기·위치를 안다고 주장하지 않는다.",
      "고미 이름: " + (owned.customName || definition.defaultName) + ", 친밀도: " + owned.affection + " (" + relation + ").",
      "현재 기분: " + companionMoodLabel(memory.mood) + ", 활력: " + memory.energy + "/5, 시간대: " + period + ".",
      "이번 홈 행동 해석: " + (memory.mood === "irritated" ? "자는 중 방해받아 짜증 난 상태를 우선한다. " : "") + gomiGestureIntent[action],
      "최근 대사(반복하지 말기): " + (previous.slice(-2).join(" / ") || "없음"),
      "새로운 대사 한마디만, 50자 이내. /no_think",
    ].map(plain).join("\n");
    const user = plain("사용자가 앱 홈의 '" + activity + "' 버튼을 눌렀다. 실제 현실의 산책·간식·방문 등을 확인한 것은 아니다. 지금 집사에게 고미가 직접 하는 새로운 한마디만 말해.");
    return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\n" + user +
      " /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
  }
  const history = memory.history.slice(-5).map(entry => entry.day + " " + companionActionLabel(definition, entry.action)).join(", ") || "없음";
  const system = [
    "너는 곰고미의 캐릭터 친구다. 사용자는 글 대신 캐릭터 터치나 함께하기 행동으로 말을 건넨다.",
    "너 자신의 이름: " + (owned.customName || definition.defaultName) + ". 사용자의 이름은 주어지지 않았다. 성격: " + (definition.personality?.archetype || "작은 친구") + ". 특징: " + (definition.personality?.keywords.join(", ") || ""),
    definition.type === "gomi" ? "말투: 짧고 자연스러운 반말. 고집이 세지만 집사를 좋아한다. 원하는 건 당당히 요구하고 재촉한다. 한숨과 '귀찮아'는 가끔만 쓴다. 친밀해져도 자기주장은 유지한다." : "말투 참고 예시(그대로 복사하지 말기): " + (definition.personality?.speechTone || ""),
    "친밀도: " + owned.affection + ". 현재 관계: " + relation + ". 낮은 친밀도에서 갑자기 살갑게 굴지 않는다.",
    "현재 기분: " + companionMoodLabel(memory.mood) + ", 활력: " + memory.energy + "/5. 현재 시간대: " + period,
    "현재 외형: " + (context.appearance || (definition.type === "gomi" ? "곱슬털의 작은 강아지" : "작은 캐릭터")),
    "현재 외형에 없는 신체 부위(잎·뿌리 등)를 지어내지 않는다.",
    "화면 안에서 함께한 최근 행동: " + history,
    ...(definition.type === "gomi" ? [
      "생활 성격: 산책을 먼저 재촉하지만 목줄·발 닦기 같은 준비나 손질은 피한다. 밥그릇까지는 직접 가고 숟가락질은 집사에게 요구한다. 손님이 오면 주로 귀찮아서 자리를 피한다.",
      "추위나 몸이 안 좋을 때는 집사에게 먼저 의지하지만 앱은 지금 그런 상태인지 모른다. 실제 외출·귀가·방문객·배변·새벽 베개 사건을 꾸며내지 않는다.",
      "이번 홈 행동 해석: " + (memory.mood === "irritated" ? "자는 중 방해받아 짜증 난 상태를 우선한다. " : "") + gomiGestureIntent[action],
    ] : []),
    "최근 했던 말(그대로 반복하지 말기): " + previous.slice(-5).join(" / "),
    definition.type === "gomi" ? "이번 행동에서 고미가 집사에게 원하는 것을 먼저 생각하고, 짧고 새로운 한마디를 만든다. 상황에 맞는 요구·투정·애정을 다르게 표현한다. 70자 이내." : "현재 반응의 감정과 상황은 지키되, 자연스러운 혼잣말이나 짧은 인사 1~2문장을 새로 만든다. 70자 이내.",
    "졸리거나 귀찮은 기분은 유지한다. 설정 설명·행동 지문·이모지·마크다운 대신 내가 직접 하는 말만 한다.",
    "사진·GPS·일기·사생활을 알지 못한다. 실제 산책이나 주어지지 않은 과거·앱 동작·해금 정보를 만들어 말하지 않는다.",
    "앞뒤 설명 없이 캐릭터가 하는 말만 출력한다. /no_think"].map(plain).join("\n");
  const situation = definition.type === "gomi"
    ? "사용자가 앱 홈의 '" + activity + "' 버튼을 눌렀다. 실제 현실의 산책·간식·방문 등을 확인한 것은 아니다."
    : "사용자가 지금 너에게 '" + activity + "' 행동을 했다.";
  const state = memory.mood === "sleepy" ? "너는 졸려서 조용히 쉬고 싶다." : memory.mood === "irritated" ? "너는 자던 중 방해받아 짜증이 난 상태다." : "너는 이 기분을 유지한다.";
  const user = situation + " 지금 너의 기분: " + companionMoodLabel(memory.mood) + ". " + state +
    " 사용자와 너는 " + relation + ". 네가 사용자에게 하는 새 한마디만 " + (definition.type === "gomi" ? "반말로 " : "") + "말해. 성격 설명·행동 지문·말투 예시를 읽어 주지 마.";
  return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\n" + plain(user) +
    " /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
}
const normalized = (line: string) => line.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "").toLowerCase();
function similarSentence(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  let row = Array.from({ length:b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length] <= Math.max(a.length, b.length) * 0.2;
}
function repeatsLine(previous: string, line: string): boolean {
  const before = normalized(cleanCompanionGeneratedText(previous)), next = normalized(line);
  if (before === next) return true;
  if (before.length >= 6 && next.length >= 6 && similarSentence(before, next)) return true;
  const formerSentences = (previous.match(/[^.!?。！？]+/gu) || []).map(normalized).filter(part => part.length >= 6);
  const nextSentences = (line.match(/[^.!?。！？]+/gu) || []).map(normalized).filter(part => part.length >= 6);
  return formerSentences.some(former => nextSentences.some(current => similarSentence(former, current)));
}
export async function generateTouchLine(context: TouchContext, generator: (prompt: string, signal?: AbortSignal) => Promise<string>, signal?: AbortSignal): Promise<CompanionGeneration> {
  const fallback: CompanionGeneration = { source: "local-rules", line: context.fallback };
  if (signal?.aborted) return fallback;
  try {
    const avoid = [...context.previous, context.fallback, context.definition.personality?.speechTone || ""];
    let prompt = buildTouchPrompt(context), failure: "invalid" | "repeated" = "invalid";
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) return fallback;
      const line = cleanCompanionGeneratedText(await generator(prompt, signal));
      if (signal?.aborted) return fallback;
      const repeated = line && avoid.some(previous => repeatsLine(previous, line));
      if (line && !repeated) return { source: "on-device", line };
      failure = repeated ? "repeated" : "invalid";
      prompt = buildTouchPrompt({ ...context, previous: [...avoid, line].filter(Boolean).slice(-5) })
        .replace("앞뒤 설명 없이", "방금 답변은 이미 한 말이거나 완성되지 않았다. 다른 표현으로 새 한마디를 만든다. 앞뒤 설명 없이");
    }
    return { ...fallback, failure };
  } catch (cause) {
    return signal?.aborted ? fallback : { ...fallback, failure: "execution", message: companionExecutionError(cause) };
  }
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

function sameReaction(a: TouchContext, b: TouchContext): boolean {
  return a.owned.id === b.owned.id && a.action === b.action && a.memory.mood === b.memory.mood
    && a.memory.energy === b.memory.energy && a.owned.affection === b.owned.affection
    && a.owned.growthStage === b.owned.growthStage && a.owned.customName === b.owned.customName
    && a.appearance === b.appearance && a.hour === b.hour;
}
// One inference at a time. Repeated equivalent gestures share work; changed states replace it.
export function createTouchReactionQueue(
  generate: (context: TouchContext, signal: AbortSignal) => Promise<CompanionGeneration>,
  publish: (reply: CompanionGeneration, context: TouchContext) => void,
  onBusy: (busy: boolean) => void, delay = 600,
) {
  let queued: { context: TouchContext; revision: number; at: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let activeContext: TouchContext | undefined;
  let completed: { reply: CompanionGeneration; context: TouchContext } | undefined;
  let revision = 0, running = false, disposed = false, held = false;
  function schedule() {
    clearTimeout(timer);
    if (!disposed && !held && queued) timer = setTimeout(() => void run(), Math.max(0, queued.at + delay - Date.now()));
  }
  async function run() {
    if (disposed || held || running || !queued) return;
    const job = queued; queued = undefined; running = true;
    const signal = new AbortController(); controller = signal;
    activeContext = job.context;
    onBusy(true);
    try {
      const reply = await generate(job.context, signal.signal);
      if (!disposed && !signal.signal.aborted && job.revision === revision) {
        if (held) completed = { reply, context:job.context };
        else publish(reply, job.context);
      }
    } catch { /* UI has already shown the immediate reaction. */ }
    finally { controller = undefined; activeContext = undefined; running = false; if (!disposed) { onBusy(false); schedule(); } }
  }
  function cancel() {
    ++revision; queued = undefined; completed = undefined; held = false; clearTimeout(timer); controller?.abort();
    if (!disposed) onBusy(false);
  }
  return {
    hold() { if (!disposed) { held = true; clearTimeout(timer); } },
    enqueue(context: TouchContext) {
      if (disposed) return;
      held = false;
      const answer = completed; completed = undefined;
      if (answer && sameReaction(answer.context, context)) {
        ++revision; queued = undefined; clearTimeout(timer); publish(answer.reply, context); return;
      }
      if (running && activeContext && !controller?.signal.aborted && sameReaction(activeContext, context)) return;
      if (queued && sameReaction(queued.context, context)) { queued.context = context; schedule(); return; }
      queued = { context, revision: ++revision, at: Date.now() };
      controller?.abort(); schedule();
    },
    cancel,
    dispose() { cancel(); disposed = true; },
  };
}
