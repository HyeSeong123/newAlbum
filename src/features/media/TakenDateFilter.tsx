import { CalendarDays, X } from "lucide-react";
import { dateRangeError } from "./collectionModel";
import "./taken-date-filter.css";

export function TakenDateFilter({ startDate, endDate, onChange }: {
  startDate: string; endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const error = dateRangeError(startDate, endDate);
  const active = Boolean(startDate || endDate);
  return <section className="takenDateFilter" aria-label="촬영일 기간 검색" data-active={active}>
    <div className="takenDateControls">
      <span className="takenDateTitle"><CalendarDays size={16} />촬영일</span>
      <label>시작일<input type="date" aria-label="촬영 시작일" value={startDate} aria-invalid={Boolean(error)} aria-describedby="takenDateHelp" onChange={event => onChange(event.target.value, endDate)} /></label>
      <span className="takenDateSeparator" aria-hidden="true">–</span>
      <label>종료일<input type="date" aria-label="촬영 종료일" value={endDate} aria-invalid={Boolean(error)} aria-describedby="takenDateHelp" onChange={event => onChange(startDate, event.target.value)} /></label>
      {active && <button className="iconText" aria-label="촬영 기간 초기화" onClick={() => onChange("", "")}><X size={15} />기간 해제</button>}
    </div>
    <p id="takenDateHelp" className={error ? "takenDateError" : "takenDateHint"} role={error ? "alert" : undefined}>{error || (active ? "시작일과 종료일을 포함해요. 촬영일이 없는 기록은 제외돼요." : "시작일 또는 종료일만 지정해도 검색할 수 있어요.")}</p>
  </section>;
}
