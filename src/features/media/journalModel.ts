import type { MediaItem, SavedAlbum } from "../../types/media";

/** Album membership keeps its saved order; media details come from the current library. */
export function syncAlbumMedia(albums: SavedAlbum[], items: MediaItem[], mediaLoaded = true): SavedAlbum[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return albums.map((album) => ({
    ...album,
    items: album.items.flatMap((item) => {
      const current = byId.get(item.id);
      return current ? [current] : mediaLoaded ? [] : [item];
    }),
  }));
}

export function journalMonths(items: MediaItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.takenAt ? [item.takenAt.slice(0, 7)] : []))].sort().reverse();
}

export function resolveJournalMonth(requested: string | null, items: MediaItem[]): string {
  const months = journalMonths(items);
  if (requested === "all" || requested === "favorites" || requested === "undated" || (requested && months.includes(requested))) return requested;
  return months[0] ?? (items.length ? "undated" : "all");
}

export function filterJournalMonth(items: MediaItem[], month: string): MediaItem[] {
  if (month === "all") return items;
  if (month === "favorites") return items.filter((item) => item.favorite);
  if (month === "undated") return items.filter((item) => !item.takenAt);
  return items.filter((item) => item.takenAt?.startsWith(month));
}

export function journalMonthTitle(month: string): string {
  if (month === "all") return "모든 기록";
  if (month === "favorites") return "즐겨찾기";
  if (month === "undated") return "날짜 없는 기록";
  return `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;
}

export function formatJournalDate(date?: string | null, includeYear = true): string {
  if (!date || date === "날짜 없음") return "날짜 없음";
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return date;
  const weekday = new Date(year, month - 1, day).toLocaleDateString("ko-KR", { weekday: "long" });
  return `${includeYear ? `${year}년 ` : ""}${month}월 ${day}일, ${weekday}`;
}

export function mediaSummary(items: MediaItem[]): string {
  const counts = { image: 0, video: 0, audio: 0 };
  items.forEach((item) => counts[item.fileType]++);
  return [counts.image ? `사진 ${counts.image}장` : "", counts.video ? `영상 ${counts.video}개` : "", counts.audio ? `음원 ${counts.audio}개` : ""].filter(Boolean).join(" · ") || "기록 없음";
}

export function arrangeJournalItems(items: MediaItem[]): MediaItem[] {
  const featuredIndex = items.findIndex((item) => item.fileType === "image" && (item.width ?? 0) >= (item.height ?? 1) * 1.15);
  if (featuredIndex <= 0) return items;
  return [items[featuredIndex], ...items.slice(0, featuredIndex), ...items.slice(featuredIndex + 1)];
}

export function isPortraitMedia(item: MediaItem): boolean {
  const { width, height } = item;
  return item.fileType !== "audio" && typeof width === "number" && typeof height === "number"
    && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > width;
}

export function isLandscapeMedia(item: MediaItem): boolean {
  const { width, height } = item;
  return item.fileType !== "audio" && typeof width === "number" && typeof height === "number"
    && Number.isFinite(width) && Number.isFinite(height) && height > 0 && width > height;
}

export function uniqueAlbumItems(items: MediaItem[]): MediaItem[] {
  const ids = new Set<string>();
  const paths = new Set<string>();
  return items.filter((item) => {
    if (ids.has(item.id) || (item.filePath && paths.has(item.filePath))) return false;
    ids.add(item.id);
    if (item.filePath) paths.add(item.filePath);
    return true;
  });
}

export function makeAlbumSpreads(items: MediaItem[]): { left: MediaItem[]; right: MediaItem[] }[] {
  // Collect matching ratios even when portrait and landscape records alternate.
  // Only the reader's presentation changes; saved membership/order is untouched.
  const groups = [false, true].map((portrait) => items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPortraitMedia(item) === portrait));
  const offsets = [0, 0];
  const spreads: { left: MediaItem[]; right: MediaItem[] }[] = [];
  function takeLeaf(): MediaItem[] {
    const first = groups[0][offsets[0]]?.index ?? Infinity;
    const second = groups[1][offsets[1]]?.index ?? Infinity;
    const group = second < first ? 1 : 0;
    const capacity = group === 1 ? 4 : 2;
    const leaf = groups[group].slice(offsets[group], offsets[group] + capacity).map(({ item }) => item);
    offsets[group] += leaf.length;
    return leaf;
  }
  while (offsets[0] + offsets[1] < items.length) {
    const left = takeLeaf();
    const right = takeLeaf();
    spreads.push({ left, right });
  }
  return spreads;
}

export function albumLeafLayout(items: MediaItem[]): "single" | "rows" | "columns" | "grid" {
  if (items.length > 2) return "grid";
  if (items.length < 2) return "single";
  return items.some(({ fileType, width, height }) => fileType !== "audio"
    && typeof width === "number" && typeof height === "number"
    && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height >= width)
    ? "columns" : "rows";
}

export function shuffleAlbumItems<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}
