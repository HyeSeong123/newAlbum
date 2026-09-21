import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Cake, CalendarDays, CalendarCheck, ChevronLeft, ChevronRight, Flower, Gift, Image, Music, Play, Plus, Trash2, X } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual, MediaImage, EmptyState } from "../../components/MediaVisual";
import { useModalBehavior } from "../../hooks/useModalBehavior";

type DayNotes = Record<string, string>;

type CalendarViewMode = "month" | "recorded";

type CalendarEventKind = "birthday" | "anniversary" | "memorial" | "appointment";

type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: CalendarEventKind;
  showDday: boolean;
  yearly?: boolean;
};

type CalendarEvents = Record<string, CalendarEvent[]>;

const DAY_NOTE_STORAGE_KEY = "oraedameun.dayNotes";
const DAY_COVER_STORAGE_KEY = "oraedameun.dayCovers";

const CALENDAR_EVENT_STORAGE_KEY = "oraedameun.calendarEvents";

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

const calendarEventMeta: Record<CalendarEventKind, { label: string; icon: typeof CalendarDays }> = {
  birthday: { label: "생일", icon: Cake },
  anniversary: { label: "기념일", icon: Gift },
  memorial: { label: "기일", icon: Flower },
  appointment: { label: "약속", icon: CalendarCheck },
};

export function Calendar({ items, onOpen, initialMonth }: { items: MediaItem[]; onOpen: (item: MediaItem) => void; initialMonth?: string }) {
  const availableMonths = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => (item.takenAt ? [item.takenAt.slice(0, 7)] : [])))).sort().reverse();
  }, [items]);
  const monthCalendarYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const mediaYears = items.flatMap((item) => (item.takenAt ? [Number(item.takenAt.slice(0, 4))] : []));
    const minYear = Math.min(1900, currentYear - 20, ...mediaYears);
    const maxYear = Math.max(currentYear + 10, ...mediaYears);
    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => String(maxYear - index));
  }, [items]);
  const recordedYears = useMemo(() => {
    return Array.from(new Set(availableMonths.map((monthLabel) => monthLabel.slice(0, 4)))).sort().reverse();
  }, [availableMonths]);
  const today = localDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(initialMonth ?? availableMonths[0] ?? today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [dayNotes, setDayNotes] = useState<DayNotes>(() => loadDayNotes());
  const [dayCovers, setDayCovers] = useState<Record<string, string>>(() => loadStringMap(DAY_COVER_STORAGE_KEY));
  const [dayEvents, setDayEvents] = useState<CalendarEvents>(() => loadCalendarEvents());
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [selectedYear, selectedMonth] = visibleMonth.split("-");
  const year = Number(selectedYear);
  const month = Number(selectedMonth);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ kind: "blank" as const, id: `blank-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ kind: "day" as const, day: index + 1, id: `day-${index + 1}` })),
    ...Array.from({ length: (7 - (firstDay + daysInMonth) % 7) % 7 }, (_, index) => ({ kind: "blank" as const, id: `end-${index}` })),
  ];
  const yearOptions = calendarViewMode === "recorded" && recordedYears.length ? recordedYears : monthCalendarYears;
  const monthOptions = calendarViewMode === "recorded"
    ? availableMonths.filter((monthLabel) => monthLabel.startsWith(`${selectedYear}-`)).map((monthLabel) => monthLabel.slice(5, 7))
    : MONTH_LABELS;
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, MediaItem[]>();
    for (const item of items) {
      if (!item.takenAt) continue;
      const matches = grouped.get(item.takenAt) ?? [];
      matches.push(item);
      grouped.set(item.takenAt, matches);
    }
    return grouped;
  }, [items]);
  const selectedDayItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];
  const recordedDates = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => (item.takenAt ? [item.takenAt] : [])))).sort().reverse();
  }, [items]);
  const visibleRecordedDates = recordedDates.filter((date) => date.startsWith(visibleMonth));

  useEffect(() => {
    if (calendarViewMode !== "recorded" || !availableMonths.length || availableMonths.includes(visibleMonth)) return;
    setVisibleMonth(availableMonths[0]);
  }, [availableMonths, calendarViewMode, visibleMonth]);

  function moveMonth(offset: number) {
    if (calendarViewMode === "recorded") {
      const monthsAscending = [...availableMonths].reverse();
      const currentIndex = monthsAscending.indexOf(visibleMonth);
      const fallbackIndex = monthsAscending.length - 1;
      const nextIndex = Math.min(Math.max((currentIndex >= 0 ? currentIndex : fallbackIndex) + offset, 0), monthsAscending.length - 1);
      if (monthsAscending[nextIndex]) setVisibleMonth(monthsAscending[nextIndex]);
      return;
    }

    const next = new Date(year, month - 1 + offset, 1);
    setVisibleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function updateMonth(part: "year" | "month", value: string) {
    if (calendarViewMode === "recorded") {
      if (part === "year") {
        const nextMonth = availableMonths.find((monthLabel) => monthLabel.startsWith(`${value}-`));
        if (nextMonth) setVisibleMonth(nextMonth);
        return;
      }

      const nextVisibleMonth = `${selectedYear}-${value}`;
      if (availableMonths.includes(nextVisibleMonth)) setVisibleMonth(nextVisibleMonth);
      return;
    }

    const nextYear = part === "year" ? value : selectedYear;
    const nextMonth = part === "month" ? value : selectedMonth;
    setVisibleMonth(`${nextYear}-${nextMonth}`);
  }

  function updateDayNote(date: string, note: string) {
    const next = { ...dayNotes };
    if (note.trim()) next[date] = note;
    else delete next[date];
    if (!saveStringMap(DAY_NOTE_STORAGE_KEY, next)) return false;
    setDayNotes(next);
    return true;
  }

  function updateDayCover(date: string, itemId: string) {
    const next = { ...dayCovers, [date]: itemId };
    if (!saveStringMap(DAY_COVER_STORAGE_KEY, next)) return false;
    setDayCovers(next);
    return true;
  }

  function addDayEvent(date: string, event: Pick<CalendarEvent, "title" | "kind" | "showDday" | "yearly">) {
    setDayEvents((current) => {
      const next = {
        ...current,
        [date]: [
          ...(current[date] ?? []),
          {
            ...event,
            id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            date,
          },
        ],
      };
      saveCalendarEvents(next);
      return next;
    });
  }

  function toggleEventDday(date: string, eventId: string) {
    setDayEvents((current) => {
      const storageDate = Object.keys(current).find((key) => current[key].some((event) => event.id === eventId)) ?? date;
      const nextEvents = (current[storageDate] ?? []).map((event) => (
        event.id === eventId ? { ...event, showDday: !event.showDday } : event
      ));
      const next = { ...current, [storageDate]: nextEvents };
      saveCalendarEvents(next);
      return next;
    });
  }

  function deleteDayEvent(date: string, eventId: string) {
    setDayEvents((current) => {
      const storageDate = Object.keys(current).find((key) => current[key].some((event) => event.id === eventId)) ?? date;
      const remaining = (current[storageDate] ?? []).filter((event) => event.id !== eventId);
      const next = { ...current };
      if (remaining.length) {
        next[storageDate] = remaining;
      } else {
        delete next[storageDate];
      }
      saveCalendarEvents(next);
      return next;
    });
  }

  return (
    <div className="calendarPanel">
      <div className="panelHeader">
        <div>
          <h2>{year}년 {month}월</h2>
        </div>
        <div className="monthPicker" aria-label="연월 선택">
          <label>
            <span>연도</span>
            <select aria-label="연도" value={selectedYear} onChange={(event) => updateMonth("year", event.target.value)} disabled={calendarViewMode === "recorded" && !availableMonths.length}>
              {yearOptions.map((yearLabel) => (
                <option key={yearLabel} value={yearLabel}>{yearLabel}년</option>
              ))}
            </select>
          </label>
          <label>
            <span>월</span>
            <select aria-label="월" value={selectedMonth} onChange={(event) => updateMonth("month", event.target.value)} disabled={calendarViewMode === "recorded" && !availableMonths.length}>
              {monthOptions.map((monthLabel) => (
                <option key={monthLabel} value={monthLabel}>{Number(monthLabel)}월</option>
              ))}
            </select>
          </label>
        </div>
        <div className="monthControls" aria-label="달 이동">
          <button className="primaryControl" onClick={() => setEventModalOpen(true)}>
            <Plus size={17} />일정 등록
          </button>
          <button onClick={() => moveMonth(-1)} title="이전 달"><ChevronLeft size={17} />이전 달</button>
          <button onClick={() => moveMonth(1)} title="다음 달">다음 달<ChevronRight size={17} /></button>
          <button onClick={() => { setCalendarViewMode("month"); setVisibleMonth(today.slice(0, 7)); }}>오늘</button>
        </div>
      </div>
      <div className="calendarModeTabs" role="tablist" aria-label="달력 보기 방식">
        <button role="tab" aria-selected={calendarViewMode === "month"} className={calendarViewMode === "month" ? "active" : ""} onClick={() => setCalendarViewMode("month")}>
          월간 달력
        </button>
        <button role="tab" aria-selected={calendarViewMode === "recorded"} className={calendarViewMode === "recorded" ? "active" : ""} onClick={() => {
          setCalendarViewMode("recorded");
          if (availableMonths.length && !availableMonths.includes(visibleMonth)) setVisibleMonth(availableMonths[0]);
        }}>
          사진 있는 날
        </button>
      </div>
      {calendarViewMode === "month" ? (
        <div className="calendarGrid">
          {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => (
            <span className={`weekday ${index === 0 ? "sunday" : index === 6 ? "saturday" : ""}`} key={label}>{label}</span>
          ))}
          {calendarCells.map((cell) => {
            if (cell.kind === "blank") return <span className="emptyDay" key={cell.id} />;
            const date = `${visibleMonth}-${String(cell.day).padStart(2, "0")}`;
            const matches = itemsByDate.get(date) ?? [];
            const cover = matches.find((item) => item.id === dayCovers[date]) ?? matches[0];
            const events = eventsOnDate(dayEvents, date);
            const weekday = (firstDay + cell.day - 1) % 7;
            return (
              <button
                key={cell.id}
                className={[matches.length ? "hasMedia" : "", dayNotes[date] ? "hasNote" : "", events.length ? "hasEvent" : "", weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : ""].filter(Boolean).join(" ")}
                aria-label={`${formatDateKo(date)}, ${formatMediaCount(matches)}${events.length ? `, 일정 ${events.length}개` : ""}`}
                aria-current={date === today ? "date" : undefined}
                onClick={() => setSelectedDate(date)}
              >
                <span className="dayNumber">{cell.day}</span>
                {events.length > 0 && (
                  <span className="dayEvents">
                    {events.slice(0, 2).map((event) => {
                      const EventIcon = calendarEventMeta[event.kind].icon;
                      return (
                        <small key={event.id} aria-label={`${event.title} ${calendarEventMeta[event.kind].label}`} title={event.title}>
                          <EventIcon size={12} />
                          <span>{calendarEventMeta[event.kind].label}</span>
                          {event.showDday && <strong>{formatDday(event.date)}</strong>}
                        </small>
                      );
                    })}
                  </span>
                )}
                {cover && (
                  <i style={{ background: cover.thumbnail }} data-media-id={cover.id}>
                    <MediaImage item={cover} />
                    {cover.fileType === "video" && <Play size={18} />}
                    {cover.fileType === "audio" && <Music size={18} />}
                  </i>
                )}
                <span className="calendarDayMeta">
                  {dayNotes[date] && <em className="dayNoteBadge">메모</em>}
                  {matches.length > 0 && <b>{matches.length}장</b>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="recordedDayGrid">
          {!visibleRecordedDates.length && <EmptyState text="이 연월에는 사진이 찍힌 날이 없습니다." />}
          {visibleRecordedDates.map((date) => {
            const matches = itemsByDate.get(date) ?? [];
            const cover = matches.find((item) => item.id === dayCovers[date]) ?? matches[0];
            return (
              <button key={date} onClick={() => setSelectedDate(date)}>
                <span>{formatDateKo(date)}</span>
                <strong>{matches.length}장</strong>
                {cover && (
                  <i style={{ background: cover.thumbnail }} data-media-id={cover.id}>
                    <MediaImage item={cover} />
                  </i>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selectedDate && (
        <DayDetailModal
          key={selectedDate}
          date={selectedDate}
          note={dayNotes[selectedDate] ?? ""}
          items={selectedDayItems}
          events={eventsOnDate(dayEvents, selectedDate)}
          onNoteChange={(note) => updateDayNote(selectedDate, note)}
          coverId={dayCovers[selectedDate] ?? ""}
          onCoverChange={(itemId) => updateDayCover(selectedDate, itemId)}
          onToggleEventDday={(eventId) => toggleEventDday(selectedDate, eventId)}
          onDeleteEvent={(eventId) => deleteDayEvent(selectedDate, eventId)}
          onOpen={onOpen}
          onClose={() => setSelectedDate(null)}
        />
      )}
      {eventModalOpen && (
        <CalendarEventModal
          initialDate={`${visibleMonth}-01`}
          onAddEvent={addDayEvent}
          onClose={() => setEventModalOpen(false)}
        />
      )}
    </div>
  );
}

function DayDetailModal({
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
}: {
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

function CalendarEventModal({
  initialDate,
  onAddEvent,
  onClose,
}: {
  initialDate: string;
  onAddEvent: (date: string, event: Pick<CalendarEvent, "title" | "kind" | "showDday" | "yearly">) => void;
  onClose: () => void;
}) {
  const [eventDate, setEventDate] = useState(initialDate);
  const [eventTitle, setEventTitle] = useState("");
  const [eventKind, setEventKind] = useState<CalendarEventKind>("birthday");
  const [showDday, setShowDday] = useState(true);
  const [yearly, setYearly] = useState(false);
  const [eventMonth, setEventMonth] = useState(initialDate.slice(5, 7));
  const [eventDay, setEventDay] = useState(initialDate.slice(8, 10));
  const annualDayCount = new Date(2000, Number(eventMonth), 0).getDate();
  useModalBehavior(onClose);

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = eventTitle.trim();
    const date = yearly ? `${eventMonth}-${eventDay}` : eventDate;
    if (!date || !title) return;
    onAddEvent(date, { title, kind: eventKind, showDday, yearly });
    onClose();
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="eventModal" role="dialog" aria-modal="true" aria-labelledby="eventModalTitle" onClick={(event) => event.stopPropagation()}>
        <header className="eventModalHeader">
          <div>
            <p className="eyebrow">일정</p>
            <h2 id="eventModalTitle">일정 등록</h2>
          </div>
          <button className="closeButton" title="닫기" onClick={onClose}><X size={18} /></button>
        </header>
        <form className="scheduleForm eventModalForm" onSubmit={submitEvent}>
          <label className="ddayCheck yearlyCheck">
            <input type="checkbox" checked={yearly} onChange={(event) => {
              setYearly(event.target.checked);
              if (event.target.checked && eventDate) { setEventMonth(eventDate.slice(5, 7)); setEventDay(eventDate.slice(8, 10)); }
            }} />
            <span>매년 반복</span>
          </label>
          {yearly ? <div className="annualDateFields">
            <label><span>월</span><select aria-label="행사 월" value={eventMonth} onChange={(event) => {
              const nextMonth = event.target.value;
              setEventMonth(nextMonth);
              setEventDay(String(Math.min(Number(eventDay), new Date(2000, Number(nextMonth), 0).getDate())).padStart(2, "0"));
            }}>{MONTH_LABELS.map((month) => <option key={month} value={month}>{Number(month)}월</option>)}</select></label>
            <label><span>일</span><select aria-label="행사 일" value={eventDay} onChange={(event) => setEventDay(event.target.value)}>{Array.from({ length: annualDayCount }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)}일</option>)}</select></label>
          </div> : <label>
            <span>날짜</span>
            <input type="date" required value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </label>}
          <label>
            <span>분류</span>
            <select value={eventKind} onChange={(event) => setEventKind(event.target.value as CalendarEventKind)}>
              {(Object.keys(calendarEventMeta) as CalendarEventKind[]).map((kind) => (
                <option key={kind} value={kind}>{calendarEventMeta[kind].label}</option>
              ))}
            </select>
          </label>
          <label className="scheduleTitleField">
            <span>내용</span>
            <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="예: 엄마 생신, 가족 저녁 약속" autoFocus />
          </label>
          <label className="ddayCheck">
            <input type="checkbox" checked={showDday} onChange={(event) => setShowDday(event.target.checked)} />
            <span>디데이 표시</span>
          </label>
          <button type="submit" disabled={(!yearly && !eventDate) || !eventTitle.trim()}>
            <Plus size={17} />일정 추가
          </button>
        </form>
      </section>
    </div>
  );
}

export function loadDayNotes(): DayNotes {
  return loadStringMap(DAY_NOTE_STORAGE_KEY);
}

function loadStringMap(key: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string"));
  } catch {
    return {};
  }
}

function saveStringMap(key: string, values: Record<string, string>): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

function eventsOnDate(events: CalendarEvents, date: string): CalendarEvent[] {
  return Object.values(events).flat().filter((event) => event.yearly
    ? event.date.slice(-5) === date.slice(5)
    : event.date === date
  ).map((event) => ({ ...event, date }));
}

function loadCalendarEvents(): CalendarEvents {
  try {
    const raw = window.localStorage.getItem(CALENDAR_EVENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as CalendarEvents : {};
  } catch {
    return {};
  }
}

function saveCalendarEvents(events: CalendarEvents) {
  try {
    window.localStorage.setItem(CALENDAR_EVENT_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 일정 저장 실패는 사진 보기 흐름을 막지 않는다.
  }
}

function formatDateKo(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMediaCount(items: MediaItem[]): string {
  const photos = items.filter((item) => item.fileType === "image").length;
  const videos = items.filter((item) => item.fileType === "video").length;
  const audio = items.length - photos - videos;
  return [photos || !items.length ? `사진 ${photos}장` : "", videos ? `영상 ${videos}개` : "", audio ? `음성 ${audio}개` : ""].filter(Boolean).join(" · ");
}

function formatDday(date: string): string {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);

  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}
