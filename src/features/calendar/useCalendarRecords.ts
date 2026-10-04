import { useEffect, useRef, useState } from "react";
import { DAY_NOTE_STORAGE_KEY, DAY_COVER_STORAGE_KEY, loadDayNotes, loadStringMap, saveStringMap } from "./calendarModel";
import { CALENDAR_REGISTRATION_CHANGED, CALENDAR_REGISTRATION_KEY, loadCalendarRegistrations, saveCalendarRegistrations } from "./calendarRegistrationStore";

export function useCalendarRecords() {
  const [records, setRecords] = useState(() => ({
    dayNotes: loadDayNotes(), dayCovers: loadStringMap(DAY_COVER_STORAGE_KEY), registrations: loadCalendarRegistrations(),
  }));
  const current = useRef(records);
  const [error, setError] = useState("");

  function publish(patch: Partial<typeof records>) {
    current.current = { ...current.current, ...patch };
    setRecords(current.current);
  }

  useEffect(() => {
    const refresh = () => publish({ registrations: loadCalendarRegistrations() });
    const storage = (event: StorageEvent) => { if (event.key === CALENDAR_REGISTRATION_KEY) refresh(); };
    window.addEventListener(CALENDAR_REGISTRATION_CHANGED, refresh);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(CALENDAR_REGISTRATION_CHANGED, refresh); window.removeEventListener("storage", storage); };
  }, []);

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

  function removeRegistration(id: string) {
    try {
      saveCalendarRegistrations(loadCalendarRegistrations().filter(record => record.id !== id));
      setError("");
      return true;
    } catch { setError("달력 등록을 해제하지 못했습니다. 다시 시도해 주세요."); return false; }
  }

  return { ...records, error, updateDayNote, updateDayCover, removeRegistration };
}
