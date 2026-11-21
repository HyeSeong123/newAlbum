import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookHeart, ChevronDown, Eye, Footprints, Gamepad2, HandHeart, Heart, Images, Moon, NotebookPen, Sun, Users } from "lucide-react";
import { CharacterVisual } from "../characters/CharacterVisual";
import { CompanionAiSetup } from "../characters/CompanionAiSetup";
import { useCompanionReactions } from "../characters/useCompanionReactions";
import { chooseCompanionFallback, companionFallbackCandidates } from "../characters/companionFallback";
import { characterDefinitions, characterName, dialogueLines, nextDialogue, type OwnedCharacter, type CharacterInteractionSource } from "../characters/models";
import { useGomiBehavior } from "../characters/useGomiBehavior";
import { gomiCanSpeak } from "../characters/gomiBehavior";
import { useCompanionBehavior } from "../characters/useCompanionBehavior";
import { COMPANION_ACTIONS, companionActionLabel, companionDisturbsSleep, performCompanionActivity, readCompanionMemory, saveCompanionMemory, type CompanionAction } from "../characters/companionActivities";
import "../characters/characters.css";
import "./home.css";

const messages = [
  "어서 와! 오늘도 네 이야기를 기다리고 있었어.",
  "오늘 하루는 어땠어? 작은 이야기라도 들려줘.",
  "아무 일 없던 하루도 나중엔 소중한 추억이 될 거야.",
  "사진 한 장에 그날의 기분도 살짝 담아볼까?",
  "잠깐 쉬어 가도 괜찮아. 나는 여기 있을게.",
  "햇볕 좋은 날엔 나도 쑥쑥 자라는 기분이야!",
  "오늘의 너에게 작은 박수! 짝짝짝.",
  "오래된 사진 속 웃음은 다시 봐도 반갑더라.",
  "좋아하는 순간들을 모으면 너만의 앨범이 되지.",
  "오늘 기억하고 싶은 장면이 하나 있었어?",
  "내 잎은 두 장이지만, 하고 싶은 말은 아주 많아!",
  "맛있는 거 먹었어? 나는 햇살 한 입 먹었어.",
  "산책하다 만난 작은 풍경도 오래 기억하고 싶어.",
  "글이 길지 않아도 괜찮아. 한 줄이면 충분한 날도 있어.",
  "추억은 천천히 자라나. 나처럼!",
  "여기 담아둔 마음들이 너에게 따뜻한 선물이 되길.",
];

type HomeViewProps = {
  today: string;
  itemCount: number;
  albumCount: number;
  diaryCount: number;
  onShowLibrary: () => void;
  onShowAlbums: () => void;
  onShowDiary: () => void;
  onShowPeople: () => void;
  onShowCharacters: () => void;
  mainCharacter?: OwnedCharacter;
  onInteract: (id: string, source: CharacterInteractionSource) => Promise<OwnedCharacter | undefined>;
};

export function HomeView({ today, itemCount, albumCount, diaryCount, onShowLibrary, onShowAlbums, onShowDiary, onShowPeople, onShowCharacters, mainCharacter, onInteract }: HomeViewProps) {
  const [spokenLine, setSpokenLine] = useState<string | undefined>(undefined);
  const [happy, setHappy] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "quiet" | "watching" | "generating" | "failed">("idle");
  const [quietResponseId, setQuietResponseId] = useState(0);
  const [aiFailure, setAiFailure] = useState("");
  const retryContext = useRef<Parameters<ReturnType<typeof useCompanionReactions>["react"]>[0] | undefined>(undefined);
  const ai = useCompanionReactions(mainCharacter?.id, result => {
    // Never speak an authored fallback as though the model said it.
    if (result.source === "on-device" && result.line.trim()) {
      retryContext.current = undefined;
      setSpokenLine(result.line.trim());
      setAiStatus("idle");
      setAiFailure("");
    } else {
      setSpokenLine(undefined);
      setAiStatus("failed");
      setAiFailure(result.message || "AI가 새 대사를 만들지 못했어요. 다시 터치해 주세요.");
    }
  });
  const lastLine = useRef(0);
  useEffect(()=>{
    if(document.hidden||(!["generating","quiet","watching","failed"].includes(aiStatus)&&!spokenLine))return;
    const message=document.getElementById("homeMessage");if(!message)return;
    const box=message.getBoundingClientRect(),x=box.left+box.width/2;
    const visible=box.top>=0&&box.bottom<=window.innerHeight&&[box.top+2,box.top+box.height/2,box.bottom-2].every(y=>{
      const hit=document.elementFromPoint(x,y);return hit!=null&&message.contains(hit);
    });
    // Activity buttons can be below the speech balloon, behind the sticky
    // navigation after scrolling. Bring the actual response back into view.
    if(!visible)message.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  },[aiStatus,spokenLine,quietResponseId]);
  const timer = useRef<number | undefined>(undefined);
  const reactionRequest = useRef(0);
  const storedInteraction = useRef<Promise<OwnedCharacter | undefined>>(Promise.resolve(undefined));
  useEffect(() => {
    const invalidate = () => {
      if (document.hidden) {
        ++reactionRequest.current;
        retryContext.current = undefined;
        setSpokenLine(undefined);
        setAiStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", invalidate);
    return () => document.removeEventListener("visibilitychange", invalidate);
  }, []);
  const definition = characterDefinitions.find(item => item.id === mainCharacter?.id);
  useEffect(() => {
    ++reactionRequest.current;
    retryContext.current = undefined;
    storedInteraction.current = Promise.resolve(undefined);
    setActivitiesOpen(false);
    setAiSetupOpen(false);
    setQuietResponseId(0);
    setSpokenLine(undefined);
    setAiStatus("idle");
    setAiFailure("");
    return () => { ++reactionRequest.current; };
  }, [mainCharacter?.id]);
  const isGomi = definition?.type === "gomi";
  const companion = useCompanionBehavior(Boolean(definition && !isGomi),mainCharacter?.id,definition?.personality?.signatureAnimation);
  const gomi = useGomiBehavior(isGomi, mainCharacter?.affection || 0, today, mainCharacter?.id);
  const lines = definition && mainCharacter ? dialogueLines(definition, mainCharacter.growthStage, mainCharacter.affection >= 20 ? "highAffection" : "idle", mainCharacter.affection) : messages;
  const dialogueEntry = useRef("");
  useEffect(() => {
    if (isGomi && !gomi.ready) return;
    // Saving a sleep disturbance can cross an affection tier. Keep the reaction
    // the user just triggered rather than resetting it to a fixed sleep line.
    const entry = `${mainCharacter?.id}:${mainCharacter?.growthStage}`;
    if (dialogueEntry.current === entry) return;
    dialogueEntry.current = entry;
    lastLine.current=0;
    setSpokenLine(undefined);
    setAiStatus("idle");
  }, [mainCharacter?.id,mainCharacter?.growthStage,gomi.ready]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
    .format(new Date(`${today}T12:00:00`));

  async function reactWithStoredRelationship(context: Parameters<typeof ai.react>[0], source?: CharacterInteractionSource) {
    const request = ++reactionRequest.current;
    retryContext.current = undefined;
    ai.waitForContext();
    if (source) storedInteraction.current = onInteract(context.owned.id, source);
    const updated = await storedInteraction.current;
    if (request !== reactionRequest.current) return;
    if (source && !updated) {
      ai.cancel();
      setAiStatus("failed");
      setAiFailure("친밀도를 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    const owned = updated?.id === context.owned.id ? { ...context.owned, affection:updated.affection } : context.owned;
    if (context.definition.type === "gomi" && !gomiCanSpeak(owned.affection)) {
      ai.cancel();
      setSpokenLine(undefined);
      setAiFailure("");
      // The ellipsis is nonverbal feedback. Identify completion only after
      // relationship storage succeeds, so an old quiet state is never a reply.
      setQuietResponseId(request);
      setAiStatus("quiet");
      return;
    }
    setAiStatus("generating");
    retryContext.current = { ...context, owned };
    ai.react(retryContext.current);
  }

  function talk() {
    if (!definition || !mainCharacter || (isGomi && !gomi.ready)) return;
    // Draw from every other message, so even rapid clicks never repeat the last line.
    const next = nextDialogue(lines,lastLine.current);
    lastLine.current=next;
    const reaction = isGomi ? gomi.react() : undefined;
    if (!isGomi) companion.react();
    const restLine = reaction?.line;
    const fallback = isGomi && !gomiCanSpeak(mainCharacter.affection) ? "" : mainCharacter ? chooseCompanionFallback(mainCharacter.id, companionFallbackCandidates({
      gomi:Boolean(isGomi), affection:mainCharacter.affection, action:"touch", sleeping:reaction?.sleeping, disturbed:reaction?.disturbed,
      basis:restLine || lines[next], touchLines:lines,
    })) : lines[next];
    setSpokenLine(undefined);
    setAiStatus(isGomi && !gomiCanSpeak(mainCharacter.affection) ? "idle" : "generating");
    setAiFailure("");
    if (definition && mainCharacter) {
      const memory = readCompanionMemory(mainCharacter.id);
      const source = reaction?.sleeping ? (reaction.disturbed ? "sleep" : undefined) : "home";
      void reactWithStoredRelationship({ definition, owned: mainCharacter, memory: reaction?.sleeping ? { ...memory, mood:reaction.disturbed ? "irritated" : "sleepy", energy:Math.min(1,memory.energy) } : memory, action:"touch", fallback, sleeping:Boolean(reaction?.sleeping) }, source);
    }
    setHappy(!isGomi && !restLine && !companion.resting);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHappy(false), 1000);
  }

  const activityIcons = { walk: Footprints, treat: Sun, pet: HandHeart, play: Gamepad2, rest: Moon };

  function watchCompanion() {
    if (!definition || !mainCharacter || (isGomi && !gomi.ready)) return;
    // Observation is not a touch, rest, meal or sleep disturbance. Invalidate
    // both unresolved saves and queued inference without changing their data.
    const request = ++reactionRequest.current;
    ai.cancel();
    retryContext.current = undefined;
    window.clearTimeout(timer.current);
    setHappy(false);
    setSpokenLine(undefined);
    setAiFailure("");
    setQuietResponseId(request);
    setAiStatus("watching");
  }

  function chooseActivity(action: CompanionAction) {
    if (!definition || !mainCharacter || (isGomi && !gomi.ready)) return;
    const sleeping = isGomi && gomi.sleeping;
    const previous=readCompanionMemory(mainCharacter.id);
    const result = performCompanionActivity(definition, previous, action, mainCharacter.affection, today, { sleeping });
    const disturbed=companionDisturbsSleep(action,sleeping);
    saveCompanionMemory(mainCharacter.id, result.memory);
    const fallback = isGomi && !gomiCanSpeak(mainCharacter.affection) ? "" : chooseCompanionFallback(mainCharacter.id, companionFallbackCandidates({ gomi:Boolean(isGomi), affection:mainCharacter.affection,
      action, sleeping, disturbed, basis:result.line }));
    setSpokenLine(undefined);
    setAiStatus(isGomi && !gomiCanSpeak(mainCharacter.affection) ? "idle" : "generating");
    setAiFailure("");
    void reactWithStoredRelationship({ definition, owned: mainCharacter, memory: {...result.memory,energy:previous.energy}, action, fallback, sleeping }, disturbed ? "sleep" : undefined);
    if (isGomi) gomi.activity(action,previous.energy);
    else { companion.activity(action); setHappy(action !== "rest"); }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHappy(false), 1000);
    // Awake activities keep affection; deliberate sleep disturbance is saved separately.
  }

  const shortcuts = [
    { label: "사진 기록", description: "사진 속 하루를 다시 만나요", count: `${itemCount}개의 기록`, icon: Images, onClick: onShowLibrary },
    { label: "내 앨범", description: "함께한 순간을 한 권에 담아요", count: `${albumCount}개의 앨범`, icon: BookHeart, onClick: onShowAlbums },
    { label: "일기장", description: "오늘의 마음을 천천히 적어요", count: `${diaryCount}편의 일기`, icon: NotebookPen, onClick: onShowDiary },
    { label: "사람과 반려동물", description: "", count: "", icon: Users, onClick: onShowPeople },
  ];

  return <section className="homeView" aria-label="곰고미 홈">
    {aiSetupOpen && definition && mainCharacter && <CompanionAiSetup key={mainCharacter.id} definition={definition} owned={mainCharacter}
      onClose={() => setAiSetupOpen(false)} />}
    <div className="homeWelcome">
      <time className="homeDate" dateTime={today}>{dateLabel}</time>
      <h2>작은 하루가 자라는 곳</h2>
      <p className="homeIntroduction">소중한 순간도, 평범한 하루도 차곡차곡 담아두세요.</p>
      <div className="homeCompanion">
        <div className="homeDialogueSlot">
          {spokenLine
            ? <p id="homeMessage" className="homeSpeech" data-source="on-device" data-gomi={isGomi ? "true" : undefined}
                role="status" aria-live="polite" aria-atomic="true">{spokenLine}</p>
            : aiStatus === "quiet" || (isGomi && !gomiCanSpeak(mainCharacter?.affection || 0) && ["idle","watching"].includes(aiStatus))
              ? <p id="homeMessage" className="homeQuiet" data-source="nonverbal" data-state={aiStatus} data-response-id={quietResponseId} role="status" aria-live="polite">
                  <span className="homeQuietDots" aria-hidden="true">...</span>
                  <span className="homeQuietDescription">{aiStatus === "watching" ? "고미를 조용히 지켜보고 있어요." : gomi.sleeping ? "고미가 말없이 쉬고 있어요." : "고미가 말없이 거리를 두고 있어요."}</span>
                </p>
            : <p id="homeMessage" className="homeSpeechNotice" data-source="status" data-state={aiStatus}
                role="status" aria-live="polite" aria-atomic="true">
                {aiStatus === "generating" ? "AI가 대사를 생성하고 있어요." :
                  aiStatus === "failed" ? aiFailure :
                  aiStatus === "watching" ? `${definition ? characterName(definition, mainCharacter) : "친구"}의 모습을 조용히 지켜보고 있어요.` :
                  isGomi && !gomi.ready ? "친구를 준비하고 있어요." :
                  definition ? "친구를 터치하면 AI가 새로운 대사를 만들어요." : "친구를 선택하면 AI와 대화할 수 있어요."}
              </p>}
          {aiStatus === "failed" && retryContext.current && <button type="button" className="homeReactionRetry" onClick={() => {
            const context = retryContext.current;
            if (!context || context.owned.id !== mainCharacter?.id || document.hidden) return;
            setAiStatus("generating");
            setAiFailure("");
            ai.react(context);
          }}>대사 다시 생성</button>}
        </div>
        <button className={`homeMascot${happy ? " happy" : ""}`} type="button" aria-label={`${definition ? characterName(definition, mainCharacter) : "곰고미"}에게 말 걸기`} onClick={talk}>
          {definition && mainCharacter ? <CharacterVisual definition={definition} stage={mainCharacter.growthStage} expression={happy ? "happy" : "idle"}
            gomiMotion={isGomi ? gomi.motion : undefined} companionMotion={!isGomi ? companion.motion : undefined}
            paused={!isGomi && companion.paused} affection={mainCharacter.affection} reactionKey={isGomi ? gomi.sequence : companion.sequence} />
            : <img src="/brand/gamjassak-symbol.png" alt="" width={1254} height={1254} draggable={false} />}
        </button>
        {definition && mainCharacter && <p className="homeCharacterMeta"><strong>{characterName(definition, mainCharacter)}</strong><span className="homeAffection"><Heart size={14} aria-hidden="true" />친밀도 {mainCharacter.affection}</span></p>}
        {definition && mainCharacter && <div className="homeActivities">
          <button type="button" className="homeActivitiesToggle" data-help="companion-ai" onClick={() => setAiSetupOpen(true)}>AI 반응 설정</button>
          <button type="button" className="homeActivitiesToggle" aria-expanded={activitiesOpen} aria-controls="homeActivitiesChoices"
            data-help="companion-actions" onClick={() => setActivitiesOpen(value => !value)}>
            함께하기 <ChevronDown size={17} aria-hidden="true" className={activitiesOpen ? "expanded" : ""} />
          </button>
          {activitiesOpen && <div id="homeActivitiesChoices" className="homeActivitiesChoices" role="group" aria-label="친구와 함께하기">
            {COMPANION_ACTIONS.map(action => {
              const Icon = activityIcons[action];
              return <button key={action} type="button" className="homeActivity" data-help={"companion-" + action}
                onClick={() => chooseActivity(action)}>
                <Icon size={19} aria-hidden="true" /><span>{companionActionLabel(definition, action)}</span>
              </button>;
            })}
            <button type="button" className="homeActivity" data-help="companion-watch" onClick={watchCompanion}>
              <Eye size={19} aria-hidden="true" /><span>지켜보기</span>
            </button>
          </div>}
        </div>}
        <button className="homeCharacterLink" type="button" onClick={onShowCharacters}>친구들 보기</button>
      </div>
    </div>
    <nav className="homeShortcuts" aria-label="기록 바로가기">
      {shortcuts.map(({ label, description, count, icon: Icon, onClick }) => <button type="button" className="homeShortcut" key={label} aria-label={`${label} 열기`} onClick={onClick}>
        <Icon className="homeShortcutIcon" size={21} aria-hidden="true" />
        <span className="homeShortcutText"><strong>{label}</strong>{description && <span>{description}</span>}{count && <small>{count}</small>}</span>
        <ArrowUpRight className="homeShortcutArrow" size={17} aria-hidden="true" />
      </button>)}
    </nav>
  </section>;
}
