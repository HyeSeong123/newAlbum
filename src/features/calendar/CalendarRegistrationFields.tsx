import { localDateKey, calendarRegistrationError, type CalendarRegistrationOptions } from "./calendarModel";
import type { MediaItem } from "../../types/media";
import "./calendar-registration.css";

export function CalendarRegistrationFields({ value, onChange, title, items }: {
  value?: CalendarRegistrationOptions;
  onChange: (value?: CalendarRegistrationOptions) => void;
  title: string;
  items?: MediaItem[];
}) {
  const error = value ? calendarRegistrationError(value, items) : "";
  const update = (patch: Partial<CalendarRegistrationOptions>) => { if (value) onChange({ ...value, ...patch }); };
  return <section className="calendarRegistrationFields" aria-label="달력 등록 옵션">
    <label className="calendarRegistrationToggle"><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked ? {
      title: "", dateMode: "taken", startDate: localDateKey(new Date()), endDate: localDateKey(new Date()),
    } : undefined)} /><span><strong>달력에 등록하기</strong><small>하루 기록은 한 칸에, 이어지는 날짜는 하나의 라벨로 표시해요.</small></span></label>
    {value && <div className="calendarRegistrationInputs">
      <label>달력 라벨<input aria-label="달력 라벨" maxLength={80} value={value.title} placeholder={title || "사진·영상 기록"} onChange={event => update({ title: event.target.value })} /></label>
      <label>등록 날짜<select aria-label="달력 등록 날짜 방식" value={value.dateMode} onChange={event => update({ dateMode: event.target.value as CalendarRegistrationOptions["dateMode"] })}>
        <option value="taken">촬영일 기준</option><option value="range">날짜 직접 선택</option>
      </select></label>
      {value.dateMode === "range" ? <div className="calendarRegistrationDates">
        <label>시작일<input aria-label="달력 시작일" type="date" required value={value.startDate} onChange={event => update({ startDate: event.target.value, endDate: event.target.value > value.endDate ? event.target.value : value.endDate })} /></label>
        <label>종료일<input aria-label="달력 종료일" type="date" required min={value.startDate} value={value.endDate} onChange={event => update({ endDate: event.target.value })} /></label>
      </div> : <p>촬영일이 이어지면 연결하고, 날짜 사이에 빈 날이 있으면 라벨을 나눠요. 촬영 날짜가 없는 파일은 날짜를 직접 선택해 주세요.</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>;
}
