import { MONTH_LABELS, formatDateKo, localDateKey, formatMediaCount, calendarYears, monthCells, calendarWeekSegments, formatCalendarPeriod } from "./calendarModel";
import { useCalendarRecords } from "./useCalendarRecords";
import { DayDetailModal } from "./DayDetailModal";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Image, Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState } from "../../components/MediaVisual";
import { journalMonths } from "../media/journalModel";

type CalendarViewMode = "month" | "recorded";

export function Calendar({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem, collection?: MediaItem[]) => void }) {
  const availableMonths = useMemo(() => journalMonths(items), [items]);
  const currentYear = new Date().getFullYear();
  const recordedYears = useMemo(() => {
    return Array.from(new Set(availableMonths.map((monthLabel) => monthLabel.slice(0, 4)))).sort().reverse();
  }, [availableMonths]);
  const today = localDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const { dayNotes, dayCovers, registrations, error, updateDayNote, updateDayCover, removeRegistration } = useCalendarRecords();
  const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const activeRegistrations = useMemo(() => registrations.filter(record => record.mediaIds.some(id => itemsById.has(id))), [registrations, itemsById]);
  const recordSummaries = useMemo(() => new Map(activeRegistrations.map(record => [record.id, formatMediaCount(record.mediaIds.flatMap(id => itemsById.get(id) ? [itemsById.get(id)!] : []))])), [activeRegistrations, itemsById]);
  const selectedRecord = activeRegistrations.find(record => record.id === selectedRecordId);
  const monthCalendarYears = useMemo(() => calendarYears(items, currentYear, activeRegistrations.flatMap(record => [record.startDate, record.endDate])), [items, currentYear, activeRegistrations]);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const todayCell = useRef<HTMLButtonElement>(null);
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
      const date = item.takenAt.slice(0, 10);
      const matches = grouped.get(date) ?? [];
      matches.push(item);
      grouped.set(date, matches);
    }
    return grouped;
  }, [items]);
  const selectedDayItems = selectedRecord ? selectedRecord.mediaIds.flatMap(id => itemsById.get(id) ? [itemsById.get(id)!] : []) : selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];
  const selectedRegistrations = selectedDate ? activeRegistrations.filter(record => selectedRecord ? record.id === selectedRecord.id : record.startDate <= selectedDate && record.endDate >= selectedDate) : [];
  const calendarWeeks = useMemo(() => Array.from({ length: calendarCells.length / 7 }, (_, index) => {
    const cells = calendarCells.slice(index * 7, index * 7 + 7);
    const dates = cells.map(cell => cell.kind === "day" ? `${visibleMonth}-${String(cell.day).padStart(2, "0")}` : null);
    return { cells, dates, hasAudio: dates.some(date => date && itemsByDate.get(date)?.some(item => item.fileType === "audio")), segments: calendarWeekSegments(activeRegistrations, dates) };
  }), [calendarCells, visibleMonth, activeRegistrations, itemsByDate]);
  const recordedDates = useMemo(() => [...itemsByDate.keys()].sort().reverse(), [itemsByDate]);
  const visibleRecordedDates = recordedDates.filter((date) => date.startsWith(visibleMonth));

  useEffect(() => {
    if (calendarViewMode === "month" && visibleMonth === today.slice(0, 7)) {
      todayCell.current?.scrollIntoView({ block: "nearest" });
    }
  }, [calendarViewMode, visibleMonth, today]);

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
            <button onClick={() => { setCalendarViewMode("month"); setVisibleMonth(today.slice(0, 7)); todayCell.current?.scrollIntoView({ block: "nearest" }); }}>오늘</button>
            <button onClick={() => moveMonth(1)} title="다음 달">다음 달<ChevronRight size={17} /></button>
          </div>
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
          <div className="calendarWeekdays">
            {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => <span className={`weekday ${index === 0 ? "sunday" : index === 6 ? "saturday" : ""}`} key={label}>{label}</span>)}
          </div>
          {calendarWeeks.map((week, weekIndex) => <div className={`calendarWeek${week.hasAudio ? " calendarWeekHasAudio" : ""}`} key={weekIndex} style={{ "--calendar-lanes": week.segments.reduce((lanes, segment) => Math.max(lanes, segment.lane + 1), 0) } as CSSProperties}>
            {week.cells.map((cell, weekday) => {
              if (cell.kind === "blank") return <span className="emptyDay" key={cell.id} />;
              const date = week.dates[weekday]!;
              const matches = itemsByDate.get(date) ?? [];
              const photos = matches.filter(item => item.fileType === "image").length;
              const videos = matches.filter(item => item.fileType === "video").length;
              const audio = matches.length - photos - videos;
              return <button key={cell.id} ref={date === today ? todayCell : undefined}
                className={["calendarDay", matches.length ? "hasMedia" : "", dayNotes[date] ? "hasNote" : "", weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : ""].filter(Boolean).join(" ")}
                aria-label={`${formatDateKo(date)}, ${formatMediaCount(matches)}${dayNotes[date] ? ", 메모 있음" : ""}`}
                aria-current={date === today ? "date" : undefined}
                onClick={() => { setSelectedRecordId(null); setSelectedDate(date); }}>
                <span className="calendarCellHeader"><span className="dayNumber">{cell.day}</span>{dayNotes[date] && <em className="dayNoteBadge" title="메모 있음">메모</em>}</span>
                <span className="calendarMediaCounts">
                  {photos > 0 && <span className="calendarPhotoCount"><Image className="calendarCountIcon" size={10} aria-hidden="true" /><span className="calendarCountKind">사진 </span><span>{photos}장</span></span>}
                  {videos > 0 && <span className="calendarVideoCount"><Play className="calendarCountIcon" size={10} aria-hidden="true" /><span className="calendarCountKind">영상 </span><span>{videos}개</span></span>}
                  {audio > 0 && <span className="calendarAudioCount"><Music className="calendarCountIcon" size={10} aria-hidden="true" /><span className="calendarCountKind">음성 </span><span>{audio}개</span></span>}
                </span>
              </button>;
            })}
            <div className="calendarWeekLabels">
              {week.segments.map(segment => {
                const summary = recordSummaries.get(segment.record.id);
                return <button key={segment.record.id} className={`calendarPeriodBar${segment.continuesBefore ? " continuesBefore" : ""}${segment.continuesAfter ? " continuesAfter" : ""}`}
                  style={{ gridColumn: `${segment.startColumn + 1} / span ${segment.length}`, gridRow: segment.lane + 1, "--record-color": segment.record.color } as CSSProperties}
                  data-record-id={segment.record.id} data-start-column={segment.startColumn} data-span={segment.length}
                  aria-label={`${segment.record.title}, ${formatCalendarPeriod(segment.record)}, ${summary}`}
                  title={`${segment.record.title} · ${formatCalendarPeriod(segment.record)} · ${summary}`}
                  onClick={() => { setSelectedRecordId(segment.record.id); setSelectedDate(week.dates[segment.startColumn]); }}>
                  <span className="calendarRecordText">{segment.record.title}</span>
                </button>;
              })}
            </div>
          </div>)}
        </div>
      ) : (
        <div className="recordedDayGrid">
          {!visibleRecordedDates.length && <EmptyState text="이 연월에는 사진이 찍힌 날이 없습니다." />}
          {visibleRecordedDates.map((date) => {
            const matches = itemsByDate.get(date) ?? [];
            return (
              <button key={date} onClick={() => { setSelectedRecordId(null); setSelectedDate(date); }}>
                <span>{formatDateKo(date)}</span>
                <strong>{formatMediaCount(matches)}</strong>
              </button>
            );
          })}
        </div>
      )}
      {selectedDate && (
        <DayDetailModal
          recordError={error}
          key={selectedRecordId ?? selectedDate}
          date={selectedDate}
          note={dayNotes[selectedDate] ?? ""}
          items={selectedDayItems}
          title={selectedRecord?.title}
          period={selectedRecord ? formatCalendarPeriod(selectedRecord) : undefined}
          registrations={selectedRegistrations}
          onOpenRegistration={(record) => { setSelectedRecordId(record.id); setSelectedDate(record.startDate); }}
          onRemoveRegistration={(id) => { if (removeRegistration(id) && selectedRecordId === id) setSelectedRecordId(null); }}
          onNoteChange={(note) => updateDayNote(selectedDate, note)}
          coverId={dayCovers[selectedDate] ?? ""}
          onCoverChange={(itemId) => updateDayCover(selectedDate, itemId)}
          onOpen={(item) => onOpen(item, selectedDayItems)}
          onClose={() => { setSelectedDate(null); setSelectedRecordId(null); }}
        />
      )}

    </div>
  );
}
