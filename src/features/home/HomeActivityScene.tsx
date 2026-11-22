import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { FIRST_LOVE_CHAPTERS, type SpecialActivity } from "../characters/companionActivities";

export type VisibleActivityScene = {
  title: string;
  scene?: SpecialActivity["scene"];
  chapter?: number;
  janggiSquare?: number;
  pending?: boolean;
  watching?: boolean;
};

const janggiTargets = [
  { square:1, label:"차를 두 칸 올리기" },
  { square:4, label:"차를 한 칸 올리기" },
];

export function HomeActivityDialog({ activity, onClose, onJanggiMove, onPour, onNextChapter, chapterPending, children }: {
  activity: VisibleActivityScene;
  onClose: () => void;
  onJanggiMove: (square: number) => void;
  onPour: () => void;
  onNextChapter: () => void;
  chapterPending: boolean;
  children?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalBehavior(onClose);
  const focus = useDialogFocus(panel);
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll:true });
  }, [activity.pending, activity.chapter]);
  return <div className="companionChatBackdrop homeActivityBackdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="companionChat homeActivityDialog" role="dialog" aria-modal="true" aria-labelledby="home-activity-title"
      tabIndex={-1} ref={panel} onKeyDown={focus}>
      <header className="companionChatHeader">
        <h2 id="home-activity-title">{activity.title}</h2>
        <button type="button" aria-label="함께하기 닫기" onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </header>
      <div className="homeActivityDialogContent">
        <HomeActivityScene activity={activity} onJanggiMove={onJanggiMove} onPour={onPour} onNextChapter={onNextChapter} chapterPending={chapterPending} />
        {children}
      </div>
    </section>
  </div>;
}

function HomeActivityScene({ activity, onJanggiMove, onPour, onNextChapter, chapterPending }: {
  activity: VisibleActivityScene;
  onJanggiMove: (square: number) => void;
  onPour: () => void;
  onNextChapter: () => void;
  chapterPending: boolean;
}) {
  const { scene, chapter = 0, janggiSquare, pending } = activity;
  if (!scene) return null;
  const story = scene.id === "first-love" ? FIRST_LOVE_CHAPTERS[chapter - 1] : undefined;
  const waitingForMove = scene.id === "janggi" && pending;
  const waitingForPour = scene.id === "pour-makgeolli" && pending;
  const chariotPosition = janggiSquare ?? 7;
  return <section className="homeActivityScene" aria-label="함께하기 장면" data-activity={scene.id}>
    {scene.id === "janggi" ? (
      <div className="homeJanggiBoard" aria-label="장기판 일부">
        {Array.from({ length:9 }, (_, square) => {
          const target = waitingForMove && janggiTargets.find(move => move.square === square);
          if (target) return <button type="button" key={square} aria-label={target.label} onClick={() => onJanggiMove(square)}>·</button>;
          return <span key={square} data-piece={chariotPosition === square ? "chariot" : undefined}
            role={chariotPosition === square ? "img" : undefined} aria-label={chariotPosition === square ? "차" : undefined}>
            {chariotPosition === square ? "車" : null}
          </span>;
        })}
      </div>
    ) : scene.id === "pour-makgeolli" ? (
      <div className="homePourTray" aria-hidden="true" data-filled={!waitingForPour}>
        <span /> <b>🍶</b> <span />
      </div>
    ) : (
      <div className="homeActivityProp" aria-hidden="true">
        {scene.id === "write-calligraphy" ? <span className="homeCalligraphy">友</span>
          : scene.id === "fill-bread" ? "🍠 → 🥟"
          : story?.prop ?? scene.prop}
      </div>
    )}
    <p role="status">{waitingForMove ? "차를 옮길 자리를 골라요."
      : waitingForPour ? "소반에 빈 잔 두 개를 놓았어요."
      : story ? `${chapter} / 3 · ${story.title}` : scene.outcome}</p>
    {waitingForPour && <button className="homeActivity" type="button" onClick={onPour}>두 잔에 따르기</button>}
    {story && chapter < FIRST_LOVE_CHAPTERS.length &&
      <button className="homeActivity" type="button" disabled={chapterPending} onClick={onNextChapter}>이어서 듣기</button>}
  </section>;
}
