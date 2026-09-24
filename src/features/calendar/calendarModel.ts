import type { MediaItem } from "../../types/media";

export type DayNotes = Record<string, string>;

export type CalendarEventKind = "birthday" | "anniversary" | "memorial" | "appointment";

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: CalendarEventKind;
  showDday: boolean;
  yearly?: boolean;
};

export type CalendarEvents = Record<string, CalendarEvent[]>;

export const DAY_NOTE_STORAGE_KEY = "oraedameun.dayNotes";

export const DAY_COVER_STORAGE_KEY = "oraedameun.dayCovers";

const CALENDAR_EVENT_STORAGE_KEY = "oraedameun.calendarEvents";

export function calendarYears(items: MediaItem[], currentYear: number): string[] {
  let minYear = Math.min(1900, currentYear - 20);
  let maxYear = currentYear + 10;
  for (const item of items) {
    if (!item.takenAt) continue;
    const year = Number(item.takenAt.slice(0, 4));
    if (!Number.isInteger(year) || year < 1 || year > 9999) continue;
    minYear = Math.min(minYear, year);
    maxYear = Math.max(maxYear, year);
  }
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => String(maxYear - index));
}

export function monthCells(year: number, month: number) {
  const count = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  return [
    ...Array.from({ length: firstDay }, (_, index) => ({ kind: "blank" as const, id: `blank-${index}` })),
    ...Array.from({ length: count }, (_, index) => ({ kind: "day" as const, day: index + 1, id: `day-${index + 1}` })),
    ...Array.from({ length: (7 - (firstDay + count) % 7) % 7 }, (_, index) => ({ kind: "blank" as const, id: `end-${index}` })),
  ];
}

type IndexedEvent = { event: CalendarEvent; order: number };
type CalendarEventIndex = { exact: Map<string, IndexedEvent[]>; yearly: Map<string, IndexedEvent[]> };

export function indexCalendarEvents(events: CalendarEvents): CalendarEventIndex {
  const exact = new Map<string, IndexedEvent[]>();
  const yearly = new Map<string, IndexedEvent[]>();
  let order = 0;
  for (const group of Object.values(events)) {
    for (const event of group) {
      const target = event.yearly ? yearly : exact;
      const key = event.yearly ? event.date.slice(-5) : event.date;
      const entries = target.get(key) ?? [];
      entries.push({ event, order: order++ });
      target.set(key, entries);
    }
  }
  return { exact, yearly };
}

export function loadDayNotes(): DayNotes {
  return loadStringMap(DAY_NOTE_STORAGE_KEY);
}

export function loadStringMap(key: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string"));
  } catch {
    return {};
  }
}

export function saveStringMap(key: string, values: Record<string, string>): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

export function eventsOnDate(index: CalendarEventIndex, date: string): CalendarEvent[] {
  // Merge the two buckets in saved order without scanning every calendar event.
  return [...(index.exact.get(date) ?? []), ...(index.yearly.get(date.slice(5)) ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(({ event }) => ({ ...event, date }));
}

export function loadCalendarEvents(): CalendarEvents {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CALENDAR_EVENT_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([date, entries]) => Array.isArray(entries)
      ? [[date, entries.filter(isCalendarEvent)]] : []));
  } catch {
    return {};
  }
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string" && typeof event.date === "string" && typeof event.title === "string"
    && ["birthday", "anniversary", "memorial", "appointment"].includes(String(event.kind))
    && typeof event.showDday === "boolean" && (event.yearly === undefined || typeof event.yearly === "boolean");
}

export function saveCalendarEvents(events: CalendarEvents) {
  try {
    window.localStorage.setItem(CALENDAR_EVENT_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 일정 저장 실패는 사진 보기 흐름을 막지 않는다.
  }
}

export function formatDateKo(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatMediaCount(items: MediaItem[]): string {
  let photos = 0;
  let videos = 0;
  let audio = 0;
  for (const item of items) {
    if (item.fileType === "image") photos++;
    else if (item.fileType === "video") videos++;
    else audio++;
  }
  return [photos || !items.length ? `사진 ${photos}장` : "", videos ? `영상 ${videos}개` : "", audio ? `음성 ${audio}개` : ""].filter(Boolean).join(" · ");
}

export function formatDday(date: string, today = new Date()): string {
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);

  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}
