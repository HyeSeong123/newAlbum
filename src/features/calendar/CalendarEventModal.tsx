import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { MONTH_LABELS, type CalendarEvent, type CalendarEventKind } from "./calendarModel";
import { calendarEventMeta } from "./calendarPresentation";

export function CalendarEventModal({
  initialDate,
  onAddEvent,
  onClose,
  error,
}: {
  error: string;
  initialDate: string;
  onAddEvent: (date: string, event: Pick<CalendarEvent, "title" | "kind" | "showDday" | "yearly">) => boolean;
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
    if (onAddEvent(date, { title, kind: eventKind, showDday, yearly })) onClose();
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
        {error && <p role="alert">{error}</p>}
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
