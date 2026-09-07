import { FormEvent, useEffect, useMemo, useState } from "react";
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

const CALENDAR_EVENT_STORAGE_KEY = "oraedameun.calendarEvents";

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

const calendarEventMeta: Record<CalendarEventKind, { label: string; icon: typeof CalendarDays }> = {
  birthday: { label: "생일", icon: Cake },
  anniversary: { label: "기념일", icon: Gift },
  memorial: { label: "기일", icon: Flower },
  appointment: { label: "약속", icon: CalendarCheck },
};

export function Calendar({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
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
  const [visibleMonth, setVisibleMonth] = useState(availableMonths[0] ?? new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [dayNotes, setDayNotes] = useState<DayNotes>(() => loadDayNotes());
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
  ];
  const yearOptions = calendarViewMode === "recorded" && recordedYears.length ? recordedYears : monthCalendarYears;
  const monthOptions = calendarViewMode === "recorded"
    ? availableMonths.filter((monthLabel) => monthLabel.startsWith(`${selectedYear}-`)).map((monthLabel) => monthLabel.slice(5, 7))
    : MONTH_LABELS;
  const selectedDayItems = selectedDate ? items.filter((item) => item.takenAt === selectedDate) : [];
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
    setDayNotes((current) => {
      const next = { ...current };
      if (note.trim()) {
        next[date] = note;
      } else {
        delete next[date];
      }
      saveDayNotes(next);
      return next;
    });
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
            <select value={selectedYear} onChange={(event) => updateMonth("year", event.target.value)} disabled={calendarViewMode === "recorded" && !availableMonths.length}>
              {yearOptions.map((yearLabel) => (
                <option key={yearLabel} value={yearLabel}>{yearLabel}년</option>
              ))}
            </select>
          </label>
          <label>
            <span>월</span>
            <select value={selectedMonth} onChange={(event) => updateMonth("month", event.target.value)} disabled={calendarViewMode === "recorded" && !availableMonths.length}>
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
          {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
            <span className="weekday" key={label}>{label}</span>
          ))}
          {calendarCells.map((cell) => {
            if (cell.kind === "blank") return <span className="emptyDay" key={cell.id} />;
            const date = `${visibleMonth}-${String(cell.day).padStart(2, "0")}`;
            const matches = items.filter((item) => item.takenAt === date);
            const events = eventsOnDate(dayEvents, date);
            return (
              <button
                key={cell.id}
                className={[matches.length ? "hasMedia" : "", dayNotes[date] ? "hasNote" : "", events.length ? "hasEvent" : ""].filter(Boolean).join(" ")}
                onClick={() => setSelectedDate(date)}
              >
                <span className="dayNumber">{cell.day}</span>
                {matches[0] && (
                  <i style={{ background: matches[0].thumbnail }}>
                    <MediaImage item={matches[0]} />
                  </i>
                )}
                {(dayNotes[date] || events.length > 0) && (
                  <span className="dayBadges">
                    {dayNotes[date] && <em>메모</em>}
                    {events.slice(0, 2).map((event) => {
                      const EventIcon = calendarEventMeta[event.kind].icon;
                      return (
                        <small key={event.id}>
                          <EventIcon size={12} />
                          {calendarEventMeta[event.kind].label}
                          {event.showDday && <strong>{formatDday(event.date)}</strong>}
                        </small>
                      );
                    })}
                  </span>
                )}
                {matches.length > 0 && <b>{matches.length}</b>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="recordedDayGrid">
          {!visibleRecordedDates.length && <EmptyState text="이 연월에는 사진이 찍힌 날이 없습니다." />}
          {visibleRecordedDates.map((date) => {
            const matches = items.filter((item) => item.takenAt === date);
            return (
              <button key={date} onClick={() => setSelectedDate(date)}>
                <span>{formatDateKo(date)}</span>
                <strong>{matches.length}장</strong>
                {matches[0] && (
                  <i style={{ background: matches[0].thumbnail }}>
                    <MediaImage item={matches[0]} />
                  </i>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          note={dayNotes[selectedDate] ?? ""}
          items={selectedDayItems}
          events={eventsOnDate(dayEvents, selectedDate)}
          onNoteChange={(note) => updateDayNote(selectedDate, note)}
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
  onToggleEventDday,
  onDeleteEvent,
  onOpen,
  onClose,
}: {
  date: string;
  note: string;
  items: MediaItem[];
  events: CalendarEvent[];
  onNoteChange: (note: string) => void;
  onToggleEventDday: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onOpen: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const [mainItemId, setMainItemId] = useState(items[0]?.id ?? "");
  const mainItem = items.find((item) => item.id === mainItemId) ?? items[0] ?? null;
  useModalBehavior(onClose);

  useEffect(() => {
    setMainItemId(items[0]?.id ?? "");
  }, [date, items]);

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="dayModal" role="dialog" aria-modal="true" aria-label={`${date} 기록`} onClick={(event) => event.stopPropagation()}>
        <header className="dayModalHeader">
          <div>
            <p className="eyebrow">그날의 기록</p>
            <h2>{formatDateKo(date)}</h2>
          </div>
          <button className="closeButton" title="닫기" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="dayMemo">
          <label htmlFor="dayNote">이날 메모</label>
          <textarea id="dayNote" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="어떤 날이었는지 적어두세요." />
        </div>
        <section className="daySchedule" aria-label="일정">
          <div className="dayScheduleHeader">
            <div>
              <p className="eyebrow">일정</p>
              <h3>이날 기억할 일</h3>
            </div>
          </div>
          <div className="eventList">
            {!events.length && <p>등록된 일정이 없습니다.</p>}
            {events.map((event) => {
              const EventIcon = calendarEventMeta[event.kind].icon;
              return (
                <article key={event.id} className={`eventItem ${event.kind}`}>
                  <span className="eventIcon"><EventIcon size={17} /></span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {calendarEventMeta[event.kind].label}
                      {event.yearly && " · 매년"}
                      {event.showDday && ` · ${formatDday(event.date)}`}
                    </small>
                  </div>
                  <label>
                    <input type="checkbox" checked={event.showDday} onChange={() => onToggleEventDday(event.id)} />
                    D-day
                  </label>
                  <button title="일정 삭제" onClick={() => onDeleteEvent(event.id)}><Trash2 size={16} /></button>
                </article>
              );
            })}
          </div>
        </section>
        <div className="dayViewer">
          <div className="dayMainPhoto">
            {mainItem ? (
              <button onClick={() => onOpen(mainItem)} aria-label="사진 상세보기">
                <MediaVisual item={mainItem}>
                  {mainItem.fileType === "video" && <Play size={44} fill="currentColor" />}
                  {mainItem.fileType === "audio" && <Music size={44} />}
                </MediaVisual>
              </button>
            ) : (
              <div className="dayEmptyPhoto">
                <Image size={30} />
                <span>이날 찍은 사진이 아직 없습니다.</span>
              </div>
            )}
          </div>
          <div className="dayPhotoList" aria-label="이날 사진 목록">
            {items.map((item) => (
              <button
                key={item.id}
                className={mainItem?.id === item.id ? "active" : ""}
                onClick={() => setMainItemId(item.id)}
                aria-label="사진 미리보기"
              >
                <MediaVisual item={item}>
                  {item.fileType === "video" && <Play size={18} fill="currentColor" />}
                  {item.fileType === "audio" && <Music size={18} />}
                </MediaVisual>
              </button>
            ))}
          </div>
        </div>
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

function loadDayNotes(): DayNotes {
  try {
    const raw = window.localStorage.getItem(DAY_NOTE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as DayNotes : {};
  } catch {
    return {};
  }
}

function saveDayNotes(notes: DayNotes) {
  try {
    window.localStorage.setItem(DAY_NOTE_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // 메모 저장 실패는 사진 보기 흐름을 막지 않는다.
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

function formatDday(date: string): string {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);

  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}
