import type { CharacterDefinition, OwnedCharacter } from "./models";
import { gomiAffinity } from "./gomiAffinity";
import type { CompanionMotion } from "./companionBehavior";

// Home-only, imaginary interactions. No GPS, media contents, account data or native AI work is accessed.
export const COMPANION_ACTIONS = ["walk", "treat", "pet", "play", "rest"] as const;
export type CompanionAction = typeof COMPANION_ACTIONS[number];
export type CompanionMood = "calm" | "curious" | "delighted" | "playful" | "sleepy" | "irritated";
export type SpecialActivity = {
  label: string;
  replies?: readonly string[];
  icon?: "water" | "sun";
  scene?: {
    id: string;
    prop: string;
    outcome: string;
    mood: CompanionMood;
    energy: number;
    motion?: CompanionMotion;
    ai?: boolean;
  };
};
export const FIRST_LOVE_CHAPTERS = [
  { id:"first-love-meeting", title:"개울가의 첫 만남", prop:"🌿" },
  { id:"first-love-letter", title:"접어 둔 편지", prop:"💌" },
  { id:"first-love-farewell", title:"나루의 작별", prop:"🌙" },
] as const;
export type CompanionMemory = {
  version: 1;
  mood: CompanionMood;
  energy: number;
  history: Array<{ action: CompanionAction; day: string; activityId?: string }>;
  bakery?: "filled" | "baked";
  storyChapter?: number;
};
export type CompanionReply = { line: string; memory: CompanionMemory; authored?: boolean; aiAction?: string };
const memoryCache = new Map<string, CompanionMemory>();
const moodLabels: Record<CompanionMood, string> = {
  calm: "차분함", curious: "호기심", delighted: "기쁨", playful: "신남", sleepy: "나른함", irritated: "짜증",
};
export function companionMoodLabel(mood: CompanionMood) { return moodLabels[mood]; }
export function emptyCompanionMemory(): CompanionMemory {
  return { version: 1, mood: "calm", energy: 3, history: [] };
}
function isAction(value: unknown): value is CompanionAction {
  return typeof value === "string" && COMPANION_ACTIONS.some(action => action === value);
}
function normalizedMemory(value: unknown): CompanionMemory | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CompanionMemory>;
  if (item.version !== 1 || typeof item.energy !== "number" || !Number.isFinite(item.energy)
    || !Object.hasOwn(moodLabels, String(item.mood)) || !Array.isArray(item.history)) return null;
  const history = item.history.filter(entry => entry && isAction(entry.action) && /^\d{4}-\d{2}-\d{2}$/.test(entry.day)).slice(-12);
  return {
    version: 1, energy: Math.max(0, Math.min(5, Math.round(item.energy))), mood: item.mood as CompanionMood,
    history: history.map(({ action, day, activityId }) => ({
      action, day, ...(/^[a-z][a-z0-9-]{0,47}$/.test(activityId ?? "") ? { activityId } : {}),
    })),
    ...(item.bakery === "filled" || item.bakery === "baked" ? { bakery:item.bakery } : {}),
    ...(item.storyChapter === 1 || item.storyChapter === 2 || item.storyChapter === 3 ? { storyChapter:item.storyChapter } : {}),
  };
}
function localStore(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
export function readCompanionMemory(characterId: string, storage: Pick<Storage, "getItem"> | undefined = localStore()): CompanionMemory {
  if (!characterId) return emptyCompanionMemory();
  const cached = memoryCache.get(characterId);
  if (cached) return cached;
  try {
    const raw = storage?.getItem("gamjassak:companion:v1:" + encodeURIComponent(characterId));
    if (raw) {
      const parsed = normalizedMemory(JSON.parse(raw));
      if (parsed) { memoryCache.set(characterId, parsed); return parsed; }
    }
  } catch { /* Storage disabled/corrupt: use an in-session memory. */ }
  return emptyCompanionMemory();
}
export function saveCompanionMemory(characterId: string, memory: CompanionMemory,
  storage: Pick<Storage, "setItem"> | undefined = localStore()): boolean {
  if (!characterId) return false;
  memoryCache.set(characterId, memory);
  try {
    storage?.setItem("gamjassak:companion:v1:" + encodeURIComponent(characterId), JSON.stringify(memory));
    return Boolean(storage);
  } catch { return false; }
}
function baseActionLabel(definition: CharacterDefinition, action: CompanionAction): string {
  const labels: Record<CompanionAction, string> = {
    walk: "함께 산책", treat: definition.treatLabel || (definition.type === "gomi" ? "간식 주기" : "햇살 선물"),
    pet: "쓰다듬기", play: "함께 놀기", rest: "함께 쉬기",
  };
  return labels[action];
}
export function companionActionLabel(definition: CharacterDefinition, action: CompanionAction): string {
  return definition.specialActivities?.[action]?.label ?? baseActionLabel(definition, action);
}
export function companionDisturbsSleep(action:CompanionAction,sleeping:boolean){
  return sleeping&&action!=="rest"&&action!=="treat";
}

// The five lines for each character correspond to walk, treat, pet, play and rest.
// This makes every character recognizable even without the optional language model.
const personaLines: Record<string, readonly [string, string, string, string, string]> = {
  gomi: ["산책 갈 거야? 난 벌써 가고 싶은데.", "간식이네. …내가 고를래.", "손은 살살. …허락한 적은 없지만.", "놀자고? 뭘 할 건데?", "이제 쉬자. 자리 좀 내줘."],
  potato: ["좋아, 출발하는 상상부터! 내가 앞장설게!", "내 자리까지 따끈해졌어! 형 것도 남겨 둘까?", "간지러워! 잠깐, 나 웃은 거 아니거든?", "내가 새 규칙 생각했어! 하면서 알려 줄게!", "조금만 쉬자. 좋은 생각 나면 바로 말할게!"],
  "sweet-potato": ["방 안에서 산책 상상이라. 뭐, 같이 보자.", "이쪽도 따뜻하네. 알토 자리도 좀 남겨 둬.", "그렇게 열심히 안 해도 돼. …조금은 괜찮고.", "규칙은 생각한 거지? 알았어, 일단 해 봐.", "조용해졌네. 옆에 있어. 같이 쉬게."],
  orange: ["출발! 톡톡 튀는 하루가 될 거야!", "햇살 한 입! 아, 기분 좋아!", "꺄, 간지럽잖아! 한 번 더!", "술래잡기? 내가 먼저 숨을게!", "쉿! 잠깐 충전하고 다시 놀자!"],
  ginkgo: ["바람이 지나간 자리를 천천히 보자.", "선물을 담아 둘 자리가 있겠군. 고마워.", "음… 뚜껑이 바스락거렸군.", "구름 모양을 맞히는 놀이도 괜찮겠지.", "잠깐 조용히 있는 것도 좋은 시간이야."],
  camellia: ["좋아. 내가 길을 살펴볼 테니 따라와.", "새우 과자라니 잘 골랐군. 바닷바람도 함께 떠오르네.", "고마워. 다만 품위는 지켜 줘.", "이번 놀이는 내가 진행할게.", "오늘 일정은 여기까지. 편히 쉬자."],
  magnolia: ["저… 같이 걸어도 될까요? 기뻐요.", "이 선물… 절 위해 고른 거예요? 조금 더 밝게 웃어 볼게요.", "앗… 조금 놀랐지만 따뜻하네요.", "제가 잘할 수 있을까요? 같이 해요.", "그냥 옆에 있어 주셔도 좋아요."],
  "sea-lavender": ["오늘 바람에는 오래된 노래가 실렸네.", "그릇 옆에 놓아 줄래? 마음이 조금 따뜻해지네.", "조용히 만져 주니 마음이 놓여.", "우리만 아는 작은 이야기를 만들자.", "고요함도 언젠가 추억이 되겠지."],
  grape: ["있잖아! 산책하면서 들려줄 얘기 엄청 많아!", "선물까지 가져왔어? 빵집 친구들한테도 자랑해야지!", "어머, 나한테 관심 주는 거야? 좋아!", "놀자! 이번엔 내가 재미있는 거 알려줄게!", "쉬면서 수다 떨자! 아직 할 말 많거든!"],
  pear: ["동선 확인 완료. 천천히 출발하자.", "선물 확인 완료. 내 취향을 꼼꼼히 살폈군.", "지느러미 쪽부터! 순서가 있거든.", "점수는 정확하게 세는 거 알지?", "여기서 쉬면 내일도 힘이 나겠어."],
  rose: ["흥, 이 정도 산책쯤은 거뜬하지!", "흥, 선물을 받을 줄은 몰랐네! 오늘은 네가 이겼어.", "쓰다듬을 거면 예쁘게 해 줘.", "승부라면 언제든 자신 있어!", "오늘은 특별히 네 옆에서 쉬어 줄게."],
  jujube: ["흐음, 이 길 끝엔 어떤 비밀이 있을까?", "이 선물에 숨은 비밀을 조금 알아낸 것 같군.", "오호, 호두 껍데기에서 신호가 왔어. 농담이야.", "엉뚱한 놀이일수록 더 재미있지.", "쉬는 동안에도 좋은 생각이 떠오를걸?"],
  chestnut: ["깜짝이야… 그래도 같이 가면 안 무서워.", "물이네! 잔뿌리까지 시원해… 고마워.", "으앗! 놀랐지만 조금 기뻐.", "나… 잘할 수 있을까? 같이 해 줘.", "옆에 있어 줘. 그러면 안심이야."],
  barley: ["오늘 작전! 나물처럼 알록달록한 길을 찾아보자!", "에너지 충전 완료! 작전 성공!", "헤헤, 간질간질한 신호가 왔어!", "이상한 규칙으로 놀아도 재밌겠지?", "낮잠 작전도 중요한 임무야!"],
  persimmon: ["천천히 가자. 급할 게 뭐 있어.", "따뜻하고 달콤한 햇살이네. 음~", "포근하네. 한 번만 더 해 줘.", "급하게 말고, 느긋하게 한 판!", "좋아. 꽃잎을 접고 느긋하게 쉴 시간이네."],
  peach: ["딱히 기다린 건 아니지만… 같이 가자.", "나만 주는 선물이야? …고맙네.", "흥! 갑자기 왜 이래… 싫진 않아.", "너랑 노는 게 제일… 아니, 그냥 좋아.", "이렇게 옆에 있는 것도 꽤 괜찮네."],
};
const gomiByAffinity: Record<CompanionAction, readonly [string, string, string, string, string]> = {
  walk: ["산책? 이제 나가는 거지?", "집사, 준비 다 됐어? 나 기다리잖아.", "갈 거면 빨리 준비해. 나 먼저 기다릴게.", "나가자. 목줄은 천천히 채우고.", "같이 나갈 거지? 오늘은 내가 길 고를래."],
  treat: ["…뭐야.", "간식? 놓고 가.", "이건 괜찮네. 한 번만 더 줘.", "내 취향 기억했어? …고마워.", "네가 준 거라 더 좋아. 비밀이야."],
  pet: ["…손 치워.", "왜 만져.", "살살 해. 알겠지?", "손길은 익숙해졌어. 조금만 더.", "…이제 손 치우면 섭섭할지도."],
  play: ["…혼자 놀아.", "딱 한 번.", "휴. 내가 이길 거야.", "놀아 주는 건 아니고, 나도 심심했어.", "오늘은 너랑 좀 더 놀아도 돼."],
  rest: ["……", "휴. 쉬자.", "조용히 있으면 좋아.", "옆에 있어도 돼. 떠들진 말고.", "여긴 네 자리야. 같이 쉬자."],
};
const gomiAfterLines: Record<CompanionAction, readonly string[]> = {
  walk: ["나가자고 했으면 오래 기다리게 하지 마.", "목줄 채우기만 지나면 내가 앞장설게.", "난 벌써 준비할 마음 먹었거든."],
  treat: ["다음에는 내가 먹기 편한 쪽으로 줘.", "내 취향은 기억하고 있는 거지?", "기다리게만 하지 마."],
  pet: ["내가 고개 돌리면 잠깐 멈춰.", "지금은 조금 더 괜찮을지도.", "네 손이 싫은 건 아니야."],
  play: ["다음 놀이는 내가 정할래.", "한 번 더 할지는 내가 결정해.", "오늘은 조금 재미있네."],
  rest: ["자리 좀 더 내줘.", "옆에 있는 건 괜찮아.", "움직일 거면 미리 말해."],
};
const afterLines: Record<CompanionAction, readonly string[]> = {
  walk: ["바람이 조금 다르게 느껴지네.", "다음에는 다른 길도 상상해 보자.", "이 시간은 기억해 둘게."],
  treat: ["기분이 조금 나아졌어.", "작은 선물도 기억에 남네.", "오늘의 선물은 잊지 않을게."],
  pet: ["조금 더 친해진 느낌이야.", "이렇게 인사하는 것도 좋네.", "그 마음은 전해졌어."],
  play: ["한 번 더 해 볼까?", "이런 놀이도 추억이 되겠지.", "다음엔 어떤 놀이를 할까?"],
  rest: ["오늘은 서두르지 말자.", "조용한 시간도 소중해.", "잠깐의 휴식도 남겨 두자."],
};
export function performCompanionActivity(definition: CharacterDefinition, previous: CompanionMemory,
  action: CompanionAction, affection: number, day: string, state: { sleeping?:boolean } = {}): CompanionReply {
  const activity = definition.specialActivities?.[action];
  const scene = activity?.scene;
  if (scene?.id === "bake-bread" && previous.bakery !== "filled") {
    return { line:"고구마 앙금부터 넣어 줘!", memory:previous, authored:true };
  }
  if ((scene?.id === "pack-bread" || scene?.id === "cool-on-rack") && previous.bakery !== "baked") {
    return { line:"앙금 넣은 소보로부터 구워 줘!", memory:previous, authored:true };
  }
  const chapter = scene?.id === "first-love" ? (previous.storyChapter ?? 0) % FIRST_LOVE_CHAPTERS.length + 1 : undefined;
  const activityId = scene?.id;
  const before = previous.history.filter(entry => activityId ? entry.activityId === activityId : entry.action === action).length;
  const deltas: Record<CompanionAction, number> = { walk: -1, treat: 1, pet: 0, play: -1, rest: 2 };
  const moods: Record<CompanionAction, CompanionMood> = {
    walk: "curious", treat: "delighted", pet: "calm", play: "playful", rest: "sleepy",
  };
  const energy = Math.min(5, Math.max(0, previous.energy + (scene?.energy ?? deltas[action])));
  const memory: CompanionMemory = {
    ...previous, mood:scene?.mood ?? moods[action], energy,
    history: [...previous.history, { action, day, ...(activityId ? { activityId } : {}) }].slice(-12),
  };
  if (activityId === "fill-bread") memory.bakery = "filled";
  if (activityId === "bake-bread") memory.bakery = "baked";
  if (chapter !== undefined) memory.storyChapter = chapter;
  const tier = gomiAffinity(affection);
  if (definition.type === "gomi" && state.sleeping) {
    if(action==="treat"){
      // An offer is not a completed meal. Preserve the pre-offer fatigue so a
      // sleeping exhausted Gomi does not gain energy before choosing to eat.
      memory.energy=previous.energy;
      memory.mood=previous.energy<=0?"sleepy":"curious";
      return {line:previous.energy<=0?"너무 졸려. 간식은 이따 줘.":"간식이야? 눈 좀 뜨고 갈게.",memory};
    }
    memory.mood = action === "rest" ? "sleepy" : "irritated";
    const restLines = ["……쌔근.","조용히… 잘게.","쉬게 둬서 고마워.","네 옆이라… 편하네.","조금 더 같이 쉬자."];
    const annoyedLines = ["휴… 자는데 건들지 마.","자잖아. 나중에 해.","지금은 졸려. 조금만 기다려.","지금은 더 자고 싶어… 옆에만 있어 줘.","너라도 지금 깨우면 서운해… 조금만 더 잘게."];
    return { line:(action === "rest" ? restLines : annoyedLines)[tier], memory };
  }
  const authored = activity?.replies;
  if (scene?.ai) {
    const aiAction = chapter ? FIRST_LOVE_CHAPTERS[chapter - 1].id : scene.id;
    return { line:authored?.[chapter ? chapter - 1 : before % authored.length] ?? "", memory, aiAction };
  }
  if (authored?.length) return { line: authored[before % authored.length], memory, authored: true };
  const voice = definition.activityVoices?.[action];
  if (voice?.length) return { line: voice[before % voice.length], memory };
  const basis = definition.type === "gomi" ? gomiByAffinity[action][tier] :
    (personaLines[definition.type] || personaLines.potato)[COMPANION_ACTIONS.indexOf(action)];
  // Repeated actions vary their closing, but never silently change affection or growth.
  const endings = definition.type === "gomi" ? gomiAfterLines[action] : afterLines[action];
  const suffix = before === 0 ? "" : " " + endings[(before - 1) % endings.length];
  return { line: basis + suffix, memory };
}
export function buildCompanionPrompt(definition: CharacterDefinition, owned: OwnedCharacter,
  memory: CompanionMemory, action: CompanionAction): { system: string; user: string } {
  const name = owned.customName || definition.defaultName;
  const history = memory.history.slice(-5).map(entry => {
    const specific = definition.specialActivities?.[entry.action];
    const label = specific?.scene?.id === entry.activityId && specific ? specific.label : baseActionLabel(definition, entry.action);
    return entry.day + " " + label;
  }).join(", ") || "아직 없음";
  return {
    system: [
      "너는 곰고미 홈 화면에서만 대화하는 캐릭터다. 반드시 자연스러운 한국어로 답한다.",
      "이름: " + name,
      "고유 성격: " + (definition.personality?.archetype || definition.description),
      "성격 키워드: " + (definition.personality?.keywords.join(", ") || ""),
      "고유 말투: " + (definition.personality?.speechTone || ""),
      "현재 외형: " + (definition.appearance || "작은 캐릭터"),
      "친밀도: " + owned.affection + " (0~19 낯섦, 20~29 서먹함, 30~59 익숙함, 60~89 가까움, 90 이상 친밀함). 성격 자체는 유지한다.",
      "현재 기분: " + companionMoodLabel(memory.mood) + ", 활력: " + memory.energy + "/5.",
      "화면 안에서 함께한 최근 놀이: " + history,
      "실제 GPS 산책, 물리적인 먹이 섭취, 사진/일기 내용, 사용자의 사생활을 안다고 가장하지 않는다.",
      "미래 성장 단계, 해금 조건이나 확인되지 않은 앱 동작을 지어내지 않는다.",
      "한두 문장, 90자 이내. 행동을 강요하거나 매일 출석을 요구하지 않는다. 이모지·마크다운·역할 이름을 출력하지 않는다.",
    ].join("\n"),
    user: "사용자가 지금 홈의 '" + companionActionLabel(definition, action) + "' 버튼을 눌렀다. 성격과 관계에 맞게 반응해.",
  };
}
