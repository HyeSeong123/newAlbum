import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { formatDateKo, formatMediaCount, loadDayNotes } from "../calendar/calendarModel";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { buildTimeline } from "./timelineModel";
import "./timeline.css";

export function TimelineView({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem, collection?: MediaItem[]) => void }) {
  const [notes] = useState(loadDayNotes);
  const timeline = useMemo(() => buildTimeline(items, notes), [items, notes]);
  const [yearsOpen, setYearsOpen] = useState<Record<string, boolean>>({});
  const [monthsOpen, setMonthsOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const selectedDay = selected === "undated" ? timeline.undated : timeline.years.flatMap(year => year.months.flatMap(month => month.days)).find(day => day.date === selected);
  if (selectedDay) return <section className="timelineView" aria-label="날짜별 기록">
    <header className="timelineDetailHeader"><button onClick={() => setSelected(null)}><ChevronLeft size={17} />타임라인으로 돌아가기</button><div>
      <h2>{selectedDay.date === "undated" ? "날짜 없는 기록" : formatDateKo(selectedDay.date)}</h2><p>{formatMediaCount(selectedDay.items)}</p>
      {selectedDay.summary && <p>{selectedDay.summary}</p>}
    </div></header>
    <RecordMediaGrid key={selectedDay.date} items={selectedDay.items} onOpen={onOpen} />
  </section>;
  return <section className="timelineView" aria-label="우리의 기록 타임라인">
    <header className="timelineHeading"><h2>우리의 기록</h2><p>날짜를 따라 다시 펼쳐보세요.</p></header>
    {!items.length && <EmptyState text="아직 표시할 기록이 없습니다." />}
    {timeline.years.map((year, yearIndex) => {
      const expanded = yearsOpen[year.year] ?? yearIndex === 0;
      return <section className="timelineYear" key={year.year}>
        <button className="timelineYearToggle" aria-label={`${year.year}년 기록`} aria-expanded={expanded} aria-controls={`timeline-year-${year.year}`} onClick={() => setYearsOpen({ ...yearsOpen, [year.year]:!expanded })}>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}<strong>{year.year}</strong><span>{year.months.reduce((sum, month) => sum + month.days.length, 0)}일의 기록</span>
        </button>
        {expanded && <div id={`timeline-year-${year.year}`} className="timelineMonths">{year.months.map((month, monthIndex) => {
          const monthExpanded = monthsOpen[month.month] ?? monthIndex === 0;
          return <section className="timelineMonth" key={month.month}>
            <button className="timelineMonthToggle" aria-label={`${year.year}년 ${Number(month.month.slice(5))}월 기록`} aria-expanded={monthExpanded} aria-controls={`timeline-month-${month.month}`} onClick={() => setMonthsOpen({ ...monthsOpen, [month.month]:!monthExpanded })}>
              {monthExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong>{Number(month.month.slice(5))}월</strong><span>{month.days.length}일</span>
            </button>
            {monthExpanded && <ol id={`timeline-month-${month.month}`} className="timelineDays">{month.days.map(day => <li key={day.date}>
              <button className="timelineDay" aria-label={`${formatDateKo(day.date)} · ${formatMediaCount(day.items)}`} onClick={() => setSelected(day.date)}>
                <time dateTime={day.date}>{day.date.slice(5).replace("-", ".")}</time>
                <MediaVisual item={day.cover}>{day.cover.fileType === "video" && <Play size={24} />}{day.cover.fileType === "audio" && <Music size={24} />}</MediaVisual>
                <span className="timelineDayText"><strong>{formatMediaCount(day.items)}</strong>{day.summary && <span>{day.summary}</span>}</span><ChevronRight size={16} />
              </button>
            </li>)}</ol>}
          </section>;
        })}</div>}
      </section>;
    })}
    {timeline.undated && <button className="timelineUndated" onClick={() => setSelected("undated")}>날짜 없는 기록 · {formatMediaCount(timeline.undated.items)}<ChevronRight size={16} /></button>}
  </section>;
}
