import type { CompanionAction } from "./companionActivities";

const recent = new Map<string, string[]>();
const key = "gamjassak:home-fallback:v1:";
const normalize = (line: string) => line.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "");
function localStore(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }
export function chooseCompanionFallback(id: string, candidates: readonly string[], store: Pick<Storage, "getItem" | "setItem"> | undefined = localStore()): string {
  const pool = [...new Map(candidates.map(line => [normalize(line), line.trim()])).values()].filter(line => /[\p{L}\p{N}]/u.test(line));
  if (!pool.length) return "잠깐 조용히 쉬고 있어.";
  let history = recent.get(id);
  if (!history) {
    try { const saved = JSON.parse(store?.getItem(key + encodeURIComponent(id)) || "[]"); if (Array.isArray(saved)) history = saved.filter(value => typeof value === "string").slice(-5); }
    catch { /* Optional history never blocks a gesture. */ }
  }
  history = history || [];
  let line = pool.find(item => !history.includes(normalize(item)));
  if (!line) line = [...pool].sort((a, b) => history!.lastIndexOf(normalize(a)) - history!.lastIndexOf(normalize(b)))[0];
  const next = [...history.filter(item => item !== normalize(line!)), normalize(line)].slice(-5);
  recent.set(id, next);
  try { store?.setItem(key + encodeURIComponent(id), JSON.stringify(next)); } catch { /* Session still remembers. */ }
  return line;
}

const sleepQuiet = [
  ["나 자고 있어. 조용히 해.", "눈 뜰 생각 없어. 조금 더 잘 거야.", "지금은 말 걸지 마. 졸려.", "옆에서 톡톡거리지 말고 그냥 둬.", "응, 들었어. 그래도 잘 거야.", "한숨 쉰 건데. 깨운 거 아니지?", "잠깐만. 아직 일어나기 싫어.", "그 손은 잠깐 쉬게 해. 나도 쉬게."],
  ["얼굴은 봤어. 이제 다시 잘게.", "왔으면 조용히 좀 있어.", "아직 졸려. 용건은 나중에.", "눈만 뜬 거야. 일어난 거 아니고.", "들었어. 지금은 대답 짧게 할래.", "휴. 조금만 더 자자.", "거기 있는 건 알아. 그만 불러.", "졸리니까 손은 잠깐만 치워."],
  ["휴. 자는 중이라고 설명까지 해야 해?", "듣고는 있어. 눈은 감고 있을게.", "잠깐만 쉬자. 용건은 짧게.", "왜 부르는지는 나중에 들을게.", "하아. 눈 뜨는 것도 귀찮네.", "내 귀는 들려. 크게 안 불러도 돼.", "조용해지면 다시 잘 거야.", "일어나면 볼게. 지금은 좀 둬."],
  ["네가 온 건 알아. 조금 더 잘게.", "옆에 있어도 돼. 조용히만 해.", "잠깐 눈 감을게. 멀리 갈 건 아니지?", "휴. 네 목소리는 들려. 지금은 좀 졸려.", "깨면 볼게. 손은 잠깐 쉬고.", "여기서 기다리든가. 난 조금만 더 잘래.", "네가 조용히 있으면 나도 편해.", "응, 왔네. 잠깐만 눈 붙일게."],
  ["내 옆에 있어. 조금만 더 잘게.", "네가 있으니까 더 졸리네. 편해서 그래.", "조용히 기대는 건 괜찮아.", "휴. 깨면 너부터 볼게.", "손은 가만히 두고 옆에만 있어.", "안 간다고 하면 나 조금 더 잘래.", "지금은 말 대신 같이 쉬자.", "들었어. 네 목소리니까 알아."],
] as const;
const sleepAnnoyed = [
  ["자는데 왜 자꾸 건드려.", "휴. 지금은 혼자 잘래. 손 치워.", "깨우지 말라고. 아직 졸려.", "지금은 아무것도 하기 싫어. 잘 거야.", "하아. 잠 좀 조용히 자자.", "눈 감은 거 안 보여? 나중에 해.", "건드리면 잠 다 깨잖아. 그만.", "그 손은 멈춰. 다시 자게."],
  ["알아봤으니까 그만 깨워.", "휴. 부른다고 바로 일어나진 않아.", "자는 동안은 좀 내버려 둬.", "지금은 귀찮아. 잠부터 잘 거야.", "손 치우면 다시 잘 수 있겠네.", "아직 안 일어났어. 나중에 해.", "그만 건드려. 눈만 뜬 거야.", "자꾸 깨우면 나도 짜증 나."],
  ["휴. 자는 중이라고 몇 번 말해야 해?", "들었어. 그래도 지금은 못 해.", "나중에 하자. 눈 감고 싶어.", "자는 동안만큼은 손 좀 치워.", "하아. 잠까지 설명해야 하네.", "그만 불러. 쉬는 것도 귀찮아지잖아.", "지금은 일어날 생각 없어.", "용건은 깨고 나서. 지금은 그만."],
  ["휴. 너라도 자꾸 깨우면 싫어.", "옆에만 있어 달랬지, 깨워 달랬어?", "잠깐 기다려. 아직 졸리다고.", "손은 살살도 말고 잠깐만 멈춰.", "깨면 같이 있을게. 지금은 좀 쉬자.", "몇 번을 불러도 지금은 잘 거야.", "안 가도 돼. 건드리지만 말고.", "한숨 나오잖아. 조금만 기다려."],
  ["너라도 잠은 좀 지켜 줘.", "휴. 옆에만 있으면 되는데 왜 깨워.", "조금만 더 잘게. 손은 이제 쉬어.", "서운해질 것 같아. 지금은 그만.", "깨면 네 옆에 있을게. 기다려.", "안 도망가니까 자꾸 안 깨워도 돼.", "나도 졸릴 땐 예민해. 조금만 참아.", "휴. 같이 쉬자고. 깨우진 말고."],
] as const;
const gomiActions: Record<CompanionAction, readonly string[]> = {
  walk: ["산책은 짧게. 오래는 싫어.", "휴. 걷자고? 잠깐만이야.", "조용히 한 바퀴만 생각해 보든가.", "그렇게 서두르지 마. 귀찮잖아.", "어디까지 갈 건데. 짧게 말해.", "바람 쐬는 정도면 생각해 볼게."],
  treat: ["간식? 일단 거기 둬.", "휴. 뭘 가져온 건데.", "고르는 건 내가 해. 기다려.", "그렇게 빤히 보지 마. 보고 있잖아.", "간식이라고 바로 반기진 않아.", "조금만. 많이는 말고."],
  pet: ["그 손. 천천히 움직여.", "갑자기 만지면 놀라잖아.", "휴. 잠깐만 허락할게.", "살살 하라고. 들었지?", "여기까지만. 이제 손 쉬어.", "왜 그렇게 열심히 만져. 귀찮게."],
  play: ["무슨 놀이인데. 복잡한 건 싫어.", "휴. 딱 한 번만 해.", "규칙은 짧게. 듣고는 있어.", "서두르지 마. 아직 안 움직였어.", "한 판 끝나면 쉴 거야.", "이상한 놀이면 난 빠질래."],
  rest: ["휴. 이제 조용히 쉬자.", "아무것도 안 할래. 잠깐은.", "지금은 쉬는 게 제일 낫겠네.", "말도 조금만 쉬자.", "하아. 가만히 있는 것도 필요해.", "조용히 있으면 같이 있어도 돼."],
};
const warmActions: Record<CompanionAction, readonly string[]> = {
  walk: ["네 옆에서 천천히 걸으면 되겠네.", "휴. 같이 갈 거면 좀 기다려.", "너랑이면 조금 덜 귀찮아.", "한 바퀴만. 너도 서두르지 마.", "같이 걷는 건 이제 익숙해.", "어디로 갈지 같이 생각해 보자."],
  treat: ["내 취향 생각했어? 휴, 알았어.", "네가 골랐으면 한 번 볼게.", "고맙다는 말 두 번은 안 해.", "자꾸 챙기네. 싫다는 건 아니고.", "나부터 생각했어? 조금 쑥스럽네.", "조금만 더 옆에 있어. 선물은 봤어."],
  pet: ["네 손길은 이제 알아. 살살 해.", "휴. 조금만 더 있어도 돼.", "익숙하다고 막 만지면 안 돼.", "잠깐 기대는 거야. 놀리지 마.", "괜찮네. 너라서 그래.", "이제 손 떼면 좀 허전하긴 하겠네."],
  play: ["너랑이면 한 판쯤은 괜찮아.", "휴. 이번엔 내가 정해도 되지?", "지는 건 싫어. 봐주진 마.", "같이 하니까 조금 덜 심심하네.", "끝나면 내 옆에서 좀 쉬어.", "한 번 더 하자고? 잠깐 쉬고."],
  rest: ["내 옆은 비어 있어. 앉든가.", "휴. 너랑 조용히 있는 건 괜찮네.", "기대도 돼. 오늘은 특별히.", "할 말 없어도 여기 있어.", "쉬는 동안은 어디 안 갔으면 해.", "조용한 네 옆이 제일 편하긴 해."],
};
const otherActions: Record<CompanionAction, readonly string[]> = {
  walk: ["오늘은 천천히 걷는 기분으로 있어 볼까?", "작은 풍경 하나를 떠올려 보자.", "서두르지 않고 나란히 있는 시간이 좋아.", "어떤 길을 걷고 싶은지 궁금하네.", "잠깐 바람을 떠올리는 것도 좋겠어.", "여기서 같이 산책 이야기를 해 보자."],
  treat: ["마음 써 준 건 알겠어.", "작은 선물이 하루를 바꾸기도 하네.", "오늘은 조금 따뜻해진 기분이야.", "나를 생각해 준 거지? 기억해 둘게.", "네가 건넨 마음은 잘 받았어.", "나란히 있으니 기분이 조금 나아졌어."],
  pet: ["조심스러운 손길이 느껴지는 것 같아.", "천천히 인사해도 괜찮아.", "잠깐 이렇게 곁에 있어 볼까?", "작은 인사도 기억에 남네.", "너를 조금 더 익숙하게 느끼는 중이야.", "말보다 손길이 먼저 인사했네."],
  play: ["이번에는 어떤 놀이가 좋을까?", "잠깐 같이 웃을 수 있으면 좋겠어.", "규칙은 천천히 정해 보자.", "작은 놀이도 같이 하면 다르네.", "한 번 해 보고 어려우면 바꿔 보자.", "쉬엄쉬엄 해도 재미있겠어."],
  rest: ["잠깐 아무것도 안 해도 괜찮아.", "조용한 시간을 같이 보내 보자.", "서두르지 않아도 되는 순간이네.", "지금은 마음도 조금 쉬게 두자.", "곁에서 느긋하게 있어도 좋겠어.", "잠깐 멈추니 숨 돌릴 틈이 생기네."],
};
export function companionFallbackCandidates(input: { gomi: boolean; affection: number; action: CompanionAction | "touch"; sleeping?: boolean; disturbed?: boolean; basis: string; touchLines?: readonly string[] }): string[] {
  const { gomi, affection, action, sleeping, disturbed, basis, touchLines = [] } = input;
  const tier = affection >= 90 ? 4 : affection >= 60 ? 3 : affection >= 30 ? 2 : affection >= 20 ? 1 : 0;
  if (gomi && sleeping) return [...(disturbed && action !== "rest" ? sleepAnnoyed : sleepQuiet)[tier]];
  if (action === "touch") return [basis, ...touchLines, ...(gomi ? gomiActions.rest : otherActions.rest)];
  return [basis, ...(gomi ? affection >= 60 ? warmActions : gomiActions : otherActions)[action]];
}
