import type { MediaItem } from "../../types/media";
import { recordDate } from "../media/recordDate";
import { REGION_LABELS, REGION_NAMES } from "../map/regions";

export const TRIP_MAX_DAY_GAP = 3;
export const TRIP_MIN_MEDIA = 3;
export const TRIP_MIN_DAYS = 2;
export const TRIP_SINGLE_DAY_MIN_MEDIA = 10;

export interface TripCandidate {
  id: string; regionCode: string; regionName: string; title: string; albumTitle: string;
  start: string; end: string; photos: number; videos: number; items: MediaItem[]; cover: MediaItem;
}

/** Replaceable cover policy; candidates are already in chronological order. */
export function chooseTripCover(items: MediaItem[]): MediaItem | undefined {
  return items.find(item => item.fileType === "image") ?? items[0];
}

function season(month: number): string {
  return month === 12 || month <= 2 ? "겨울" : month <= 5 ? "봄" : month <= 8 ? "여름" : "가을";
}

export function discoverTrips(items: MediaItem[]): TripCandidate[] {
  // Work solely on metadata. Local EXIF calendar days are never shifted through
  // the viewer's timezone; UTC is used only to subtract validated date strings.
  const dated = items.flatMap(item => {
    const date = recordDate(item.takenAt);
    return item.fileType !== "audio" && date ? [{ item, date, day: Date.parse(`${date}T00:00:00Z`) / 86_400_000 }] : [];
  }).sort((a,b) => a.date.localeCompare(b.date) || (a.item.takenAt ?? "").localeCompare(b.item.takenAt ?? "") || a.item.id.localeCompare(b.item.id, undefined, { numeric: true }));
  const candidates: TripCandidate[] = [];
  let group: typeof dated = [];
  function finish() {
    if (group.length < TRIP_MIN_MEDIA) { group = []; return; }
    const days = new Set(group.map(entry => entry.date)).size;
    if (days < TRIP_MIN_DAYS && group.length < TRIP_SINGLE_DAY_MIN_MEDIA) { group = []; return; }
    const records = group.map(entry => entry.item);
    const start = group[0].date, end = group[group.length - 1].date;
    const regionCode = records[0].regionCode!;
    const cover = chooseTripCover(records)!;
    const label = REGION_LABELS[regionCode];
    candidates.push({ id: `${regionCode}:${records[0].id}:${records[records.length-1].id}`, regionCode,
      regionName: REGION_NAMES[regionCode], start, end, items: records, cover,
      title: `${start.slice(0,4)}년 ${season(Number(start.slice(5,7)))} ${label}`,
      albumTitle: `${start.slice(0,4)}년 ${label} 여행`,
      photos: records.filter(item => item.fileType === "image").length,
      videos: records.filter(item => item.fileType === "video").length,
    });
    group = [];
  }
  for (const entry of dated) {
    // Unknown locations also separate visits; never join two visits over a
    // possible move. Returning to the same region creates a new candidate.
    if (!entry.item.regionCode || !Object.hasOwn(REGION_NAMES, entry.item.regionCode)) { finish(); continue; }
    const previous = group[group.length - 1];
    if (previous && (previous.item.regionCode !== entry.item.regionCode || entry.day - previous.day > TRIP_MAX_DAY_GAP)) finish();
    group.push(entry);
  }
  finish();
  return candidates.sort((a,b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start) || a.id.localeCompare(b.id));
}
