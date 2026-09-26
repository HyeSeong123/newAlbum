import type { MediaItem } from "../../types/media";
import { recordDate } from "../media/recordDate";

export type TimelineDay = {
  date: string; items: MediaItem[]; cover: MediaItem; summary: string; photoCount: number; videoCount: number;
};
export type TimelineMonth = { month: string; days: TimelineDay[] };
export type TimelineYear = { year: string; months: TimelineMonth[] };

export function buildTimeline(items: MediaItem[], notes: Record<string, string> = {}): { years: TimelineYear[]; undated?: TimelineDay } {
  const buckets = new Map<string, MediaItem[]>();
  for (const item of items) {
    const date = recordDate(item.takenAt) ?? "undated";
    const bucket = buckets.get(date) ?? []; bucket.push(item); buckets.set(date, bucket);
  }
  function day(date: string, entries: MediaItem[]): TimelineDay {
    const ordered = [...entries].sort((a,b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? ""));
    return { date, items:ordered, cover:ordered.find(item => item.fileType === "image") ?? ordered[0],
      summary:(notes[date]?.trim() || ordered.find(item => item.title?.trim())?.title?.trim() || ordered.find(item => item.comment.trim())?.comment.trim() || "").slice(0,160),
      photoCount:ordered.filter(item => item.fileType === "image").length,
      videoCount:ordered.filter(item => item.fileType === "video").length,
    };
  }
  const years: TimelineYear[] = [];
  for (const date of [...buckets.keys()].filter(key => key !== "undated").sort().reverse()) {
    const yearKey = date.slice(0,4), monthKey = date.slice(0,7);
    let year = years.at(-1);
    if (year?.year !== yearKey) { year = { year:yearKey, months:[] }; years.push(year); }
    let month = year.months.at(-1);
    if (month?.month !== monthKey) { month = { month:monthKey, days:[] }; year.months.push(month); }
    month.days.push(day(date, buckets.get(date)!));
  }
  return { years, undated:buckets.has("undated") ? day("undated", buckets.get("undated")!) : undefined };
}
