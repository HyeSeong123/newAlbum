import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Image, Music, Play, Trash2, X } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { formatDateKo, formatDday, formatMediaCount, type CalendarEvent } from "./calendarModel";
import { calendarEventMeta } from "./calendarPresentation";

export function DayDetailModal({
  date,
  note,
  items,
  events,
  onNoteChange,
  coverId,
  onCoverChange,
  onToggleEventDday,
  onDeleteEvent,
  onOpen,
  onClose,
  eventError,
}: {
  eventError?: string;
  date: string;
  note: string;
  items: MediaItem[];
  events: CalendarEvent[];
  onNoteChange: (note: string) => boolean;
  coverId: string;
  onCoverChange: (itemId: string) => boolean;
  onToggleEventDday: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onOpen: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const representative = items.find((item) => item.id === coverId) ?? items[0];
  const [mainItemId, setMainItemId] = useState(representative?.id ?? "");
  const mainIndex = Math.max(0, items.findIndex((item) => item.id === mainItemId));
  const mainItem = items[mainIndex] ?? null;
  const [draftNote, setDraftNote] = useState(note);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  function movePhoto(offset: number) {
    const next = items[mainIndex + offset];
    if (next) setMainItemId(next.id);
  }

  function updateScrollControls() {
    const strip = filmstripRef.current;
    if (!strip) return;
    setCanScrollBack(strip.scrollLeft > 1);
    setCanScrollForward(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  }

  function scrollThumbnails(direction: number) {
    const strip = filmstripRef.current;
    strip?.scrollBy({ left: direction * strip.clientWidth * 0.85, behavior: "smooth" });
  }

  function saveNote() {
    if (onNoteChange(draftNote)) {
      setSaveError("");
      setSaveMessage("메모를 저장했습니다.");
    } else {
      setSaveMessage("");
      setSaveError("메모를 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.");
    }
  }

  function setRepresentative() {
    if (!mainItem) return;
    if (onCoverChange(mainItem.id)) {
      setSaveError("");
      setSaveMessage("대표사진을 설정했습니다.");
    } else {
      setSaveMessage("");
      setSaveError("대표사진을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  useModalBehavior(onClose, { onPrev: () => movePhoto(-1), onNext: () => movePhoto(1) });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(updateScrollControls);
    observer.observe(strip);
    updateScrollControls();
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const strip = filmstripRef.current;
    const active = strip?.children[mainIndex] as HTMLElement | undefined;
    if (!strip || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    updateScrollControls();
  }, [mainIndex, items.length]);

  return (
    <div className="modalBackdrop calendarDayBackdrop" role="presentation">
      <section ref={dialogRef} className="calendarDayDialog" role="dialog" aria-modal="true" aria-label={`${date} 기록`} tabIndex={-1} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input:not(:disabled), [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}>
        <header className="calendarDayHeader">
          <div>
            <h2>{formatDateKo(date)} {new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", { weekday: "long" })}</h2>
            <p>{formatMediaCount(items)}</p>
          </div>
          <button className="calendarDayClose" aria-label="닫기" title="닫기" onClick={onClose}><X size={22} /></button>
        </header>
        <div className="calendarDayViewer">
          <div className="calendarDayStage">
            {mainItem ? (
              <>
                <button className="calendarDayOpen" onClick={() => onOpen(mainItem)} aria-label="사진 상세보기" data-media-id={mainItem.id}>
                  <MediaVisual item={mainItem} original className="calendarDayVisual">
                    {mainItem.fileType === "video" && <Play size={44} fill="currentColor" />}
                    {mainItem.fileType === "audio" && <Music size={44} />}
                  </MediaVisual>
                </button>
                <button className="calendarPhotoArrow previous" aria-label="이전 사진" title="이전 사진" disabled={mainIndex === 0} onClick={() => movePhoto(-1)}><ChevronLeft size={22} /></button>
                <button className="calendarPhotoArrow next" aria-label="다음 사진" title="다음 사진" disabled={mainIndex === items.length - 1} onClick={() => movePhoto(1)}><ChevronRight size={22} /></button>
                <span className="calendarPhotoPosition" aria-live="polite">{mainIndex + 1} / {items.length}</span>
              </>
            ) : (
              <div className="calendarDayEmpty"><Image size={30} /><span>이날 찍은 사진이 아직 없습니다.</span></div>
            )}
          </div>
          {items.length > 0 && <div className="calendarFilmstrip">
            <div ref={filmstripRef} className="calendarThumbnails" aria-label="이날 사진 목록" onScroll={updateScrollControls}>
              {items.map((item, index) => (
                <button
                  key={item.id}
                  className={mainItem?.id === item.id ? "active" : ""}
                  onClick={() => setMainItemId(item.id)}
                  aria-label={`사진 미리보기 ${index + 1}`}
                  aria-pressed={mainItem?.id === item.id}
                  data-media-id={item.id}
                >
                  <MediaVisual item={item}>
                    {item.fileType === "video" && <Play size={18} fill="currentColor" />}
                    {item.fileType === "audio" && <Music size={18} />}
                  </MediaVisual>
                  {representative?.id === item.id && <span className="calendarCoverBadge">대표</span>}
                </button>
              ))}
            </div>
            {canScrollBack && <button className="calendarStripArrow previous" aria-label="이전 썸네일" title="이전 썸네일" onClick={() => scrollThumbnails(-1)}><ChevronLeft size={19} /></button>}
            {canScrollForward && <button className="calendarStripArrow next" aria-label="다음 썸네일" title="다음 썸네일" onClick={() => scrollThumbnails(1)}><ChevronRight size={19} /></button>}
          </div>}
        </div>
        <section className="calendarDayMemo">
          <div className="calendarMemoHeader">
            <label htmlFor="dayNote">그날의 메모</label>
            <span>{Number(date.slice(5, 7))}월 {Number(date.slice(8))}일의 기록</span>
            <button onClick={saveNote}>메모 저장</button>
          </div>
          <textarea id="dayNote" value={draftNote} onChange={(event) => { setDraftNote(event.target.value); setSaveMessage(""); setSaveError(""); }} placeholder="어떤 날이었는지 적어두세요." />
        </section>
        {events.length > 0 && <section className="calendarDaySchedule" aria-label="일정">
          {eventError && <p role="alert">{eventError}</p>}
          <h3>이날의 일정</h3>
          <div className="eventList">
            {events.map((event) => {
              const EventIcon = calendarEventMeta[event.kind].icon;
              return <article key={event.id} className={`eventItem ${event.kind}`}>
                <span className="eventIcon"><EventIcon size={17} /></span>
                <div>
                  <strong>{event.title}</strong>
                  <small>{calendarEventMeta[event.kind].label}{event.yearly && " · 매년"}{event.showDday && ` · ${formatDday(event.date)}`}</small>
                </div>
                <label><input type="checkbox" checked={event.showDday} onChange={() => onToggleEventDday(event.id)} />D-day</label>
                <button title="일정 삭제" onClick={() => onDeleteEvent(event.id)}><Trash2 size={16} /></button>
              </article>;
            })}
          </div>
        </section>}
        <footer className="calendarDayFooter">
          <div className="calendarSaveStatus">
            <span role="status">{saveMessage}</span>
            {saveError && <span role="alert">{saveError}</span>}
          </div>
          <button onClick={onClose}>닫기</button>
          <button className="calendarSetCover" disabled={!mainItem || mainItem.id === representative?.id} onClick={setRepresentative}>대표사진으로 설정</button>
        </footer>
      </section>
    </div>
  );
}
