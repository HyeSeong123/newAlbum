import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Heart, Image } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { journalMonths } from "./journalModel";

export function PhotoDateNavigation({ items, activeMonth, onChange }: {
  items: MediaItem[];
  activeMonth: string;
  onChange: (month: string) => void;
}) {
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const months = useMemo(() => journalMonths(items), [items]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    items.forEach((item) => {
      if (!item.takenAt) return;
      const month = item.takenAt.slice(0, 7);
      result.set(month, (result.get(month) ?? 0) + 1);
    });
    return result;
  }, [items]);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  const defaultYear = /^\d{4}-\d{2}$/.test(activeMonth) ? activeMonth.slice(0, 4) : years[0];

  return <aside className="monthRail" aria-label="촬영 월">
    <div className="monthRailShortcuts">
      <button className={activeMonth === "all" ? "active" : ""} aria-current={activeMonth === "all" ? "page" : undefined} onClick={() => onChange("all")}><Image size={18} aria-hidden="true" /><span>모든 기록</span></button>
      <button className={activeMonth === "favorites" ? "active" : ""} aria-current={activeMonth === "favorites" ? "page" : undefined} onClick={() => onChange("favorites")}><Heart size={18} aria-hidden="true" /><span>즐겨찾기</span></button>
    </div>
    <div className="monthRailDates">
      <p className="monthRailLabel">촬영 시기</p>
      {years.map((year) => {
        const expanded = expandedYears[year] ?? year === defaultYear;
        return <section className="monthRailYear" key={year}>
          <button className="monthRailYearToggle" aria-expanded={expanded} aria-controls={`journal-months-${year}`} onClick={() => setExpandedYears((current) => ({ ...current, [year]: !expanded }))}>
            {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}<strong>{year}년</strong>
          </button>
          <div className="monthRailMonths" id={`journal-months-${year}`} hidden={!expanded}>
            {months.filter((month) => month.startsWith(year)).map((month) => <button key={month} className={activeMonth === month ? "active" : ""} aria-label={`${Number(year)}년 ${Number(month.slice(5))}월`} aria-current={activeMonth === month ? "date" : undefined} onClick={() => onChange(month)}>
              <span>{Number(month.slice(5))}월</span><span className="monthRailCount" aria-hidden="true">{counts.get(month)}</span>
            </button>)}
          </div>
        </section>;
      })}
    </div>
    <div className="monthRailFooter">
      <button className={activeMonth === "undated" ? "active" : ""} aria-current={activeMonth === "undated" ? "page" : undefined} onClick={() => onChange("undated")}><CalendarDays size={18} aria-hidden="true" /><span>날짜 없음</span></button>
    </div>
  </aside>;
}
