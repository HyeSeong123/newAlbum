import type { MediaItem } from "../../types/media";

const supportedExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "mp3",
  "wav",
  "flac",
  "m4a",
]);

export function isSupportedMedia(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return Boolean(extension && supportedExtensions.has(extension));
}

export function groupByTakenDate(items: MediaItem[]) {
  return items.reduce<Record<string, MediaItem[]>>((groups, item) => {
    const key = item.takenAt ?? "날짜 없음";
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function sameMonthItems(items: MediaItem[], yearMonth: string) {
  return items.filter((item) => item.takenAt?.startsWith(yearMonth));
}
