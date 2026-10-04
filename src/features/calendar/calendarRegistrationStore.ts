import { isCalendarDate, type CalendarRegistration } from "./calendarModel";

export const CALENDAR_REGISTRATION_KEY = "oraedameun.calendarRegistrations-v1";
export const CALENDAR_REGISTRATION_CHANGED = "gamjassak-calendar-registrations-changed";

export function loadCalendarRegistrations(): CalendarRegistration[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CALENDAR_REGISTRATION_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is CalendarRegistration => Boolean(entry)
      && typeof entry.id === "string" && typeof entry.title === "string"
      && typeof entry.startDate === "string" && isCalendarDate(entry.startDate)
      && typeof entry.endDate === "string" && isCalendarDate(entry.endDate) && entry.startDate <= entry.endDate
      && Array.isArray(entry.mediaIds) && entry.mediaIds.every((id: unknown) => typeof id === "string")
      && typeof entry.color === "string" && (entry.albumId === undefined || typeof entry.albumId === "string"));
  } catch { return []; }
}

export function saveCalendarRegistrations(records: CalendarRegistration[]): void {
  window.localStorage.setItem(CALENDAR_REGISTRATION_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(CALENDAR_REGISTRATION_CHANGED));
}

export function addCalendarRegistrations(records: CalendarRegistration[]): void {
  if (records.length) saveCalendarRegistrations([...loadCalendarRegistrations(), ...records]);
}
