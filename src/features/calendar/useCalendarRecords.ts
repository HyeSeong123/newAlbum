import { useMemo, useRef, useState } from "react";
import {
  DAY_NOTE_STORAGE_KEY, DAY_COVER_STORAGE_KEY, loadDayNotes, loadStringMap, saveStringMap,
  loadCalendarEvents, saveCalendarEvents, indexCalendarEvents, updateCalendarEvent,
  type CalendarEvent, type CalendarEvents,
} from "./calendarModel";

export function useCalendarRecords() {
  const [records, setRecords] = useState(() => ({
    dayNotes: loadDayNotes(), dayCovers: loadStringMap(DAY_COVER_STORAGE_KEY), dayEvents: loadCalendarEvents(),
  }));
  const current = useRef(records);
  const [error, setError] = useState("");
  const eventIndex = useMemo(() => indexCalendarEvents(records.dayEvents), [records.dayEvents]);

  function publish(patch: Partial<typeof records>) {
    current.current = { ...current.current, ...patch };
    setRecords(current.current);
  }

  function updateDayNote(date: string, note: string) {
    const next = { ...current.current.dayNotes };
    if (note.trim()) next[date] = note;
    else delete next[date];
    if (!saveStringMap(DAY_NOTE_STORAGE_KEY, next)) return false;
    publish({ dayNotes: next });
    return true;
  }

  function updateDayCover(date: string, itemId: string) {
    const next = { ...current.current.dayCovers, [date]: itemId };
    if (!saveStringMap(DAY_COVER_STORAGE_KEY, next)) return false;
    publish({ dayCovers: next });
    return true;
  }

  function commitEvents(next: CalendarEvents) {
    if (!saveCalendarEvents(next)) {
      setError("일정을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.");
      return false;
    }
    publish({ dayEvents: next });
    setError("");
    return true;
  }

  function addDayEvent(date: string, event: Pick<CalendarEvent, "title" | "kind" | "showDday" | "yearly">) {
    const events = current.current.dayEvents;
    return commitEvents({ ...events, [date]: [...(events[date] ?? []), { ...event, id: `event-${crypto.randomUUID()}`, date }] });
  }

  function toggleEventDday(id: string) {
    return commitEvents(updateCalendarEvent(current.current.dayEvents, id, (event) => ({ ...event, showDday: !event.showDday })));
  }

  function deleteDayEvent(id: string) {
    return commitEvents(updateCalendarEvent(current.current.dayEvents, id, () => null));
  }

  return { ...records, eventIndex, error, updateDayNote, updateDayCover, addDayEvent, toggleEventDday, deleteDayEvent };
}
