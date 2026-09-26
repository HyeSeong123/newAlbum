import { MONTH_LABELS, formatDateKo, localDateKey, formatMediaCount, formatDday, calendarYears, monthCells, eventsOnDate } from "./calendarModel";
import { calendarEventMeta } from "./calendarPresentation";
import { useCalendarRecords } from "./useCalendarRecords";
import { DayDetailModal } from "./DayDetailModal";
import { CalendarEventModal } from "./CalendarEventModal";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Music, Play, Plus } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaImage, EmptyState } from "../../components/MediaVisual";
import { journalMonths } from "../media/journalModel";

type CalendarViewMode = "month" | "recorded";

export function Calendar({ items, onOpen, initialMonth }: { items: MediaItem[]; onOpen: (item: MediaItem) => void; initialMonth?: string }) {
  const availableMonths = useMemo(() => journalMonths(items), [items]);
  const currentYear = new Date().getFullYear();
  const monthCalendarYears = useMemo(() => calendarYears(items, currentYear), [items, currentYear]);
  const recordedYears = useMemo(() => {
    return Array.from(new Set(availableMonths.map((monthLabel) => monthLabel.slice(0, 4)))).sort().reverse();
  }, [availableMonths]);
  const today = localDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(initialMonth ?? availableMonths[0] ?? today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const { dayNotes, dayCovers, eventIndex, error, updateDayNote, updateDayCover, addDayEvent, toggleEventDday, deleteDayEvent } = useCalendarRecords();
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [selectedYear, selectedMonth] = visibleMonth.split("-");
  const year = Number(selectedYear);
  const month = Number(selectedMonth);
  const calendarCells = useMemo(() => monthCells(year, month), [year, month]);
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
  const recordedDates = useMemo(() => [...itemsByDate.keys()].sort().reverse(), [itemsByDate]);
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
        <div className="monthControls" aria-label="달력 작업">
          <div className="calendarNavigation" role="group" aria-label="달 이동">
            <button onClick={() => moveMonth(-1)} title="이전 달"><ChevronLeft size={17} />이전 달</button>
            <button onClick={() => { setCalendarViewMode("month"); setVisibleMonth(today.slice(0, 7)); }}>오늘</button>
            <button onClick={() => moveMonth(1)} title="다음 달">다음 달<ChevronRight size={17} /></button>
          </div>
          <button className="primaryControl" onClick={() => setEventModalOpen(true)}>
            <Plus size={17} />일정 등록
          </button>
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
          {calendarCells.map((cell, cellIndex) => {
            if (cell.kind === "blank") return <span className="emptyDay" key={cell.id} />;
            const date = `${visibleMonth}-${String(cell.day).padStart(2, "0")}`;
            const matches = itemsByDate.get(date) ?? [];
            const cover = matches.find((item) => item.id === dayCovers[date]) ?? matches[0];
            const events = eventsOnDate(eventIndex, date);
            const weekday = cellIndex % 7;
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
          eventError={error}
          key={selectedDate}
          date={selectedDate}
          note={dayNotes[selectedDate] ?? ""}
          items={selectedDayItems}
          events={eventsOnDate(eventIndex, selectedDate)}
          onNoteChange={(note) => updateDayNote(selectedDate, note)}
          coverId={dayCovers[selectedDate] ?? ""}
          onCoverChange={(itemId) => updateDayCover(selectedDate, itemId)}
          onToggleEventDday={(eventId) => toggleEventDday(eventId)}
          onDeleteEvent={(eventId) => deleteDayEvent(eventId)}
          onOpen={onOpen}
          onClose={() => setSelectedDate(null)}
        />
      )}
      {eventModalOpen && (
        <CalendarEventModal
          error={error}
          initialDate={`${visibleMonth}-01`}
          onAddEvent={addDayEvent}
          onClose={() => setEventModalOpen(false)}
        />
      )}
    </div>
  );
}
