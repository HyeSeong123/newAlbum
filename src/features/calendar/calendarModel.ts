import type { MediaItem } from "../../types/media";

export type DayNotes = Record<string, string>;

export const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

export type CalendarRegistrationOptions = {
  title: string;
  dateMode: "taken" | "range";
  startDate: string;
  endDate: string;
};

export type CalendarRegistration = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  mediaIds: string[];
  color: string;
  albumId?: string;
};

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}

export function nextCalendarDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

export function calendarRegistrationError(options: CalendarRegistrationOptions, items?: MediaItem[]): string {
  if (options.dateMode === "range") {
    if (!isCalendarDate(options.startDate) || !isCalendarDate(options.endDate)) return "등록할 시작일과 종료일을 선택해 주세요.";
    if (options.startDate > options.endDate) return "종료일은 시작일과 같거나 이후여야 해요.";
  } else if (items?.some(item => !item.takenAt || !isCalendarDate(item.takenAt.slice(0, 10)))) {
    return "촬영 날짜가 없는 기록이 있어요. 날짜를 직접 선택해 주세요.";
  }
  return "";
}

export function createCalendarRegistrations(items: MediaItem[], options: CalendarRegistrationOptions, title: string, color: string, albumId?: string): CalendarRegistration[] {
  const error = calendarRegistrationError(options, items);
  if (error) throw new Error(error);
  if (!items.length) return [];
  const base = { title: options.title.trim() || title, color, ...(albumId ? { albumId } : {}) };
  if (options.dateMode === "range") {
    return [{ ...base, id: `record-${crypto.randomUUID()}`, startDate: options.startDate, endDate: options.endDate, mediaIds: [...new Set(items.map(item => item.id))] }];
  }
  const byDate = new Map<string, string[]>();
  for (const item of items) {
    const date = item.takenAt!.slice(0, 10);
    const ids = byDate.get(date) ?? [];
    ids.push(item.id);
    byDate.set(date, ids);
  }
  const result: CalendarRegistration[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const previous = result.at(-1);
    if (previous && nextCalendarDate(previous.endDate) === date) {
      previous.endDate = date;
      for (const id of byDate.get(date)!) previous.mediaIds.push(id);
    } else {
      result.push({ ...base, id: `record-${crypto.randomUUID()}`, startDate: date, endDate: date, mediaIds: [...byDate.get(date)!] });
    }
  }
  return result;
}

export type CalendarWeekSegment = {
  record: CalendarRegistration;
  startColumn: number;
  length: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

// Clip each record to this week and place overlapping bars in separate lanes.
export function calendarWeekSegments(records: CalendarRegistration[], dates: (string | null)[]): CalendarWeekSegment[] {
  const actual = dates.filter((date): date is string => Boolean(date));
  if (!actual.length) return [];
  const start = actual[0], end = actual.at(-1)!;
  const segments: CalendarWeekSegment[] = [];
  for (const record of [...records].sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id))) {
    if (record.startDate > end || record.endDate < start) continue;
    const columns = dates.flatMap((date, column) => date && date >= record.startDate && date <= record.endDate ? [column] : []);
    const first = columns[0], last = columns.at(-1)!;
    let lane = 0;
    while (segments.some(segment => segment.lane === lane && first < segment.startColumn + segment.length && last >= segment.startColumn)) lane++;
    segments.push({ record, startColumn: first, length: last - first + 1, lane, continuesBefore: record.startDate < dates[first]!, continuesAfter: record.endDate > dates[last]! });
  }
  return segments;
}

export function formatCalendarPeriod(record: Pick<CalendarRegistration, "startDate" | "endDate">): string {
  return record.startDate === record.endDate ? formatDateKo(record.startDate) : `${formatDateKo(record.startDate)} ~ ${formatDateKo(record.endDate)}`;
}

export const DAY_NOTE_STORAGE_KEY = "oraedameun.dayNotes";

export const DAY_COVER_STORAGE_KEY = "oraedameun.dayCovers";


export function calendarYears(items: MediaItem[], currentYear: number, extraDates: string[] = []): string[] {
  let minYear = Math.min(1900, currentYear - 20);
  let maxYear = currentYear + 10;
  for (const item of items) {
    if (!item.takenAt) continue;
    const year = Number(item.takenAt.slice(0, 4));
    if (!Number.isInteger(year) || year < 1 || year > 9999) continue;
    minYear = Math.min(minYear, year);
    maxYear = Math.max(maxYear, year);
  }
  for (const date of extraDates) {
    const year = Number(date.slice(0, 4));
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
