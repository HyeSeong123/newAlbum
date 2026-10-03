import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookHeart, Images, NotebookPen } from "lucide-react";
import { CharacterVisual } from "../characters/CharacterVisual";
import { characterDefinitions, characterName, companionLabel, dialogueLines, growthStageName, nextDialogue, type OwnedCharacter } from "../characters/models";
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
  onShowCharacters: () => void;
  mainCharacter?: OwnedCharacter;
  onInteract: (id: string) => void;
};

export function HomeView({ today, itemCount, albumCount, diaryCount, onShowLibrary, onShowAlbums, onShowDiary, onShowCharacters, mainCharacter, onInteract }: HomeViewProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [happy, setHappy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const definition = characterDefinitions.find(item => item.id === mainCharacter?.id);
  const lines = definition && mainCharacter ? dialogueLines(definition, mainCharacter.growthStage, definition.defaultUnlocked ? "idle" : mainCharacter.affection >= 20 ? "highAffection" : "greeting") : messages;
  useEffect(() => { setMessageIndex(0); }, [mainCharacter?.id]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
    .format(new Date(`${today}T12:00:00`));

  function talk() {
    // Draw from every other message, so even rapid clicks never repeat the last line.
    setMessageIndex(previous => nextDialogue(lines, previous));
    setHappy(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHappy(false), 1000);
    if (mainCharacter) onInteract(mainCharacter.id);
  }

  const shortcuts = [
    { label: "사진 기록", description: "사진 속 하루를 다시 만나요", count: `${itemCount}개의 기록`, icon: Images, onClick: onShowLibrary },
    { label: "내 앨범", description: "함께한 순간을 한 권에 담아요", count: `${albumCount}개의 앨범`, icon: BookHeart, onClick: onShowAlbums },
    { label: "일기장", description: "오늘의 마음을 천천히 적어요", count: `${diaryCount}편의 일기`, icon: NotebookPen, onClick: onShowDiary },
  ];

  return <section className="homeView" aria-label="감자싹 홈">
    <div className="homeWelcome">
      <time className="homeDate" dateTime={today}>{dateLabel}</time>
      <h2>작은 하루가 자라는 곳</h2>
      <p className="homeIntroduction">소중한 순간도, 평범한 하루도 차곡차곡 담아두세요.</p>
      <div className="homeCompanion">
        <p id="homeMessage" className="homeSpeech" role="status" aria-live="polite" aria-atomic="true">{lines[messageIndex] || lines[0]}</p>
        <button className={`homeMascot${happy ? " happy" : ""}`} type="button" aria-label={`${definition ? characterName(definition, mainCharacter) : "감자싹"}에게 말 걸기`} aria-describedby="homeMascotHint" onClick={talk}>
          {definition && mainCharacter ? <CharacterVisual definition={definition} stage={mainCharacter.growthStage} expression={happy ? "happy" : "idle"} />
            : <img key={messageIndex} src="/brand/gamjassak-symbol.png" alt="" width={1254} height={1254} draggable={false} />}
        </button>
        {definition && mainCharacter && <p className="homeCharacterMeta"><strong>{characterName(definition, mainCharacter)}</strong><span>{definition.defaultUnlocked ? companionLabel(definition) : `${definition.regionLabel}에서 만난 친구`}</span><span>{growthStageName(definition, mainCharacter.growthStage)} · {definition.defaultUnlocked ? `${definition.regionLabel} ` : ""}추억 {mainCharacter.regionPhotoCount}장 · 친밀도 {mainCharacter.affection}</span></p>}
        <p id="homeMascotHint" className="homeMascotHint">새싹을 톡 눌러 말을 걸어보세요</p>
        <button className="homeCharacterLink" type="button" onClick={onShowCharacters}>새싹 도감 보기</button>
      </div>
    </div>
    <nav className="homeShortcuts" aria-label="기록 바로가기">
      {shortcuts.map(({ label, description, count, icon: Icon, onClick }) => <button type="button" className="homeShortcut" key={label} aria-label={`${label} 열기`} onClick={onClick}>
        <Icon className="homeShortcutIcon" size={21} aria-hidden="true" />
        <span className="homeShortcutText"><strong>{label}</strong><span>{description}</span><small>{count}</small></span>
        <ArrowUpRight className="homeShortcutArrow" size={17} aria-hidden="true" />
      </button>)}
    </nav>
  </section>;
}
