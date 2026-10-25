import type { CharacterDefinition, OwnedCharacter } from "./models";
import { gomiAffinity } from "./gomiAffinity";

// Home-only, imaginary interactions. No GPS, media contents, account data or native AI work is accessed.
export const COMPANION_ACTIONS = ["walk", "treat", "pet", "play", "rest"] as const;
export type CompanionAction = typeof COMPANION_ACTIONS[number];
export type CompanionMood = "calm" | "curious" | "delighted" | "playful" | "sleepy" | "irritated";
export type CompanionMemory = {
  version: 1;
  mood: CompanionMood;
  energy: number;
  history: Array<{ action: CompanionAction; day: string }>;
};
export type CompanionReply = { line: string; memory: CompanionMemory };
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
  return {
    version: 1, energy: Math.max(0, Math.min(5, Math.round(item.energy))), mood: item.mood as CompanionMood,
    history: item.history.filter(entry => entry && isAction(entry.action) && /^\d{4}-\d{2}-\d{2}$/.test(entry.day)).slice(-12),
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
export function companionActionLabel(definition: CharacterDefinition, action: CompanionAction): string {
  const labels: Record<CompanionAction, string> = {
    walk: "함께 산책", treat: definition.type === "gomi" ? "간식 주기" : "햇살 선물",
    pet: "쓰다듬기", play: "함께 놀기", rest: "함께 쉬기",
  };
  return labels[action];
}

// The five lines for each character correspond to walk, treat, pet, play and rest.
// This makes every character recognizable even without the optional language model.
const personaLines: Record<string, readonly [string, string, string, string, string]> = {
  gomi: ["산책? …귀찮은데, 바람은 괜찮네.", "간식이네. …일단 먹어는 줄게.", "손은 살살. …허락한 적은 없지만.", "놀자고? 딱 한 번만이야.", "드디어 쉬는 거야? 조용히 있어."],
  potato: ["앗! 같이 나가? 작은 풍경도 찾아보자!", "햇살이 따끈해! 나 조금 자랄 것 같아.", "헤헤, 간지러워! 잎이 흔들리잖아.", "우리 숨은 그림 찾기 할까?", "조금만 쉬었다가 또 이야기하자!"],
  "sweet-potato": ["형이 앞장설게! 길은 잘 모르지만.", "햇살 좋다! 우리 동생도 불러야겠네.", "간지럽네. 형도 이런 건 좀 쑥스러워.", "형이 질 리 없지! 다시 해 볼래?", "오늘은 형 옆에 기대도 돼."],
  apple: ["좋아, 길을 정하고 차분하게 다녀오자.", "빛이 충분하네. 오늘 관리는 합격.", "조심해. 잎이 구겨지면 곤란하니까.", "규칙은 간단해. 끝까지 집중하기.", "휴식도 계획의 일부야. 잘했어."],
  orange: ["출발! 톡톡 튀는 하루가 될 거야!", "햇살 한 입! 아, 기분 좋아!", "꺄, 간지럽잖아! 한 번 더!", "술래잡기? 내가 먼저 숨을게!", "쉿! 잠깐 충전하고 다시 놀자!"],
  ginkgo: ["바람이 지나간 자리를 천천히 보자.", "빛이 오래 머무는 오후군. 나쁘지 않아.", "음… 잎사귀가 작은 소리를 내네.", "구름 모양을 맞히는 놀이도 괜찮겠지.", "잠깐 조용히 있는 것도 좋은 시간이야."],
  camellia: ["좋아. 내가 길을 살펴볼 테니 따라와.", "필요한 선물은 제때 챙기는군. 훌륭해.", "고마워. 다만 품위는 지켜 줘.", "이번 놀이는 내가 진행할게.", "오늘 일정은 여기까지. 편히 쉬자."],
  magnolia: ["저… 같이 걸어도 될까요? 기뻐요.", "이 햇살… 저를 위해 준비한 거예요?", "앗… 조금 놀랐지만 따뜻하네요.", "제가 잘할 수 있을까요? 같이 해요.", "그냥 옆에 있어 주셔도 좋아요."],
  "sea-lavender": ["오늘 바람에는 오래된 노래가 실렸네.", "작은 빛에도 하루가 환해질 수 있구나.", "조용히 만져 주니 마음이 놓여.", "우리만 아는 작은 이야기를 만들자.", "고요함도 언젠가 추억이 되겠지."],
  grape: ["있잖아! 산책하면서 들려줄 얘기 엄청 많아!", "햇살 맛있다! 이 소식도 전해야지!", "어머, 나한테 관심 주는 거야? 좋아!", "놀자! 이번엔 내가 재미있는 거 알려줄게!", "쉬면서 수다 떨자! 아직 할 말 많거든!"],
  pear: ["동선 확인 완료. 천천히 출발하자.", "햇빛이 적당하군. 꼼꼼한 선물이야.", "이쪽 잎부터! 순서가 있거든.", "점수는 정확하게 세는 거 알지?", "여기서 쉬면 내일도 힘이 나겠어."],
  rose: ["흥, 이 정도 산책쯤은 거뜬하지!", "꽃이 더 멋져졌지? 당연한 결과야.", "쓰다듬을 거면 예쁘게 해 줘.", "승부라면 언제든 자신 있어!", "오늘은 특별히 네 옆에서 쉬어 줄게."],
  jujube: ["흐음, 이 길 끝엔 어떤 비밀이 있을까?", "햇살의 비밀을 조금 알아낸 것 같군.", "오호, 잎에서 신호가 왔어. 농담이야.", "엉뚱한 놀이일수록 더 재미있지.", "쉬는 동안에도 좋은 생각이 떠오를걸?"],
  chestnut: ["깜짝이야… 그래도 같이 가면 안 무서워.", "햇살이다! 따뜻해… 훌쩍.", "으앗! 놀랐지만 조금 기뻐.", "나… 잘할 수 있을까? 같이 해 줘.", "옆에 있어 줘. 그러면 안심이야."],
  barley: ["오늘 작전! 햇살 따라 탐험하기!", "에너지 충전 완료! 작전 성공!", "헤헤, 간질간질한 신호가 왔어!", "이상한 규칙으로 놀아도 재밌겠지?", "낮잠 작전도 중요한 임무야!"],
  persimmon: ["천천히 가자. 급할 게 뭐 있어.", "따뜻하고 달콤한 햇살이네. 음~", "포근하네. 한 번만 더 해 줘.", "급하게 말고, 느긋하게 한 판!", "좋아. 오늘은 푹 익어 가는 시간이지."],
  peach: ["딱히 기다린 건 아니지만… 같이 가자.", "나만 주는 햇살이야? …고맙네.", "흥! 갑자기 왜 이래… 싫진 않아.", "너랑 노는 게 제일… 아니, 그냥 좋아.", "이렇게 옆에 있는 것도 꽤 괜찮네."],
};
const gomiByAffinity: Record<CompanionAction, readonly [string, string, string, string, string]> = {
  walk: ["…나가기 싫어.", "뭐. 나들이?", "휴. 한 바퀴만이야.", "바람은 괜찮네. 네 옆이면.", "…너랑이면 조금 더 걸어도 돼."],
  treat: ["…뭐야.", "간식? 놓고 가.", "이건 괜찮네. 한 번만 더 줘.", "내 취향 기억했어? …고마워.", "네가 준 거라 더 좋아. 비밀이야."],
  pet: ["…손 치워.", "왜 만져.", "살살 해. 알겠지?", "손길은 익숙해졌어. 조금만 더.", "…이제 손 치우면 섭섭할지도."],
  play: ["…혼자 놀아.", "딱 한 번.", "휴. 내가 이길 거야.", "놀아 주는 건 아니고, 나도 심심했어.", "오늘은 너랑 좀 더 놀아도 돼."],
  rest: ["……", "휴. 쉬자.", "조용히 있으면 좋아.", "옆에 있어도 돼. 떠들진 말고.", "여긴 네 자리야. 같이 쉬자."],
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
  const before = previous.history.filter(entry => entry.action === action).length;
  const deltas: Record<CompanionAction, number> = { walk: -1, treat: 1, pet: 0, play: -1, rest: 2 };
  const moods: Record<CompanionAction, CompanionMood> = {
    walk: "curious", treat: "delighted", pet: "calm", play: "playful", rest: "sleepy",
  };
  const energy = Math.min(5, Math.max(0, previous.energy + deltas[action]));
  const memory: CompanionMemory = {
    version: 1, mood: moods[action], energy,
    history: [...previous.history, { action, day }].slice(-12),
  };
  const tier = gomiAffinity(affection);
  if (definition.type === "gomi" && state.sleeping) {
    memory.mood = action === "rest" ? "sleepy" : "irritated";
    const restLines = ["……쌔근.","조용히… 잘게.","쉬게 둬서 고마워.","네 옆이라… 편하네.","조금 더 같이 쉬자."];
    const annoyedLines = ["휴… 자는데 건들지 마.","자잖아. 나중에 해.","지금은 졸려. 조금만 기다려.","지금은 더 자고 싶어… 옆에만 있어 줘.","너라도 지금 깨우면 서운해… 조금만 더 잘게."];
    return { line:(action === "rest" ? restLines : annoyedLines)[tier], memory };
  }
  const basis = definition.type === "gomi" ? gomiByAffinity[action][tier] :
    (personaLines[definition.type] || personaLines.potato)[COMPANION_ACTIONS.indexOf(action)];
  // Repeated actions vary their closing, but never silently change affection or growth.
  const suffix = before === 0 ? "" : " " + afterLines[action][(before - 1) % afterLines[action].length];
  return { line: basis + suffix, memory };
}
export function buildCompanionPrompt(definition: CharacterDefinition, owned: OwnedCharacter,
  memory: CompanionMemory, action: CompanionAction): { system: string; user: string } {
  const name = owned.customName || definition.defaultName;
  const history = memory.history.slice(-5).map(entry => entry.day + " " + companionActionLabel(definition, entry.action)).join(", ") || "아직 없음";
  return {
    system: [
      "너는 감자싹 홈 화면에서만 대화하는 캐릭터다. 반드시 자연스러운 한국어로 답한다.",
      "이름: " + name,
      "고유 성격: " + (definition.personality?.archetype || definition.description),
      "성격 키워드: " + (definition.personality?.keywords.join(", ") || ""),
      "고유 말투: " + (definition.personality?.speechTone || ""),
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
