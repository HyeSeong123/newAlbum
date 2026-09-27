import type { MediaItem } from "../../types/media";

export type LibrarySort = "date-desc" | "date-asc" | "name" | "comments" | "rating" | "views";
export type LibraryMediaType = "all" | MediaItem["fileType"];

export type CollectionOptions = {
  sort: LibrarySort;
  mediaType: LibraryMediaType;
  favoritesOnly: boolean;
  commentsOnly: boolean;
  minimumRating: number;
  startDate?: string;
  endDate?: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function dateRangeError(startDate = "", endDate = ""): string {
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate))) return "올바른 날짜를 입력해 주세요.";
  return startDate && endDate && startDate > endDate ? "종료일은 시작일과 같거나 이후여야 해요." : "";
}

const idCollator = new Intl.Collator(undefined, { numeric: true });
const nameCollator = new Intl.Collator("ko", { numeric: true });

export function selectMediaCollection(items: MediaItem[], options: CollectionOptions, commentCounts: Record<string, number>): MediaItem[] {
  const { sort, mediaType, favoritesOnly, commentsOnly, minimumRating, startDate = "", endDate = "" } = options;
  if (dateRangeError(startDate, endDate)) return [];
  const result = items.filter((item) => (
    (mediaType === "all" || item.fileType === mediaType)
    && (!favoritesOnly || item.favorite)
    && (!commentsOnly || (commentCounts[item.id] ?? 0) > 0)
    && item.rating >= minimumRating
    && (!(startDate || endDate) || (Boolean(item.takenAt) && validDate(item.takenAt!.slice(0, 10))
      && (!startDate || item.takenAt!.slice(0, 10) >= startDate)
      && (!endDate || item.takenAt!.slice(0, 10) <= endDate)))
  ));
  return result.sort((a, b) => {
    if (sort === "date-asc") return (a.takenAt ?? "9999").localeCompare(b.takenAt ?? "9999") || idCollator.compare(a.id, b.id);
    if (sort === "name") return nameCollator.compare(a.fileName, b.fileName);
    const byDate = (b.takenAt ?? "").localeCompare(a.takenAt ?? "");
    if (sort === "date-desc") return byDate || idCollator.compare(b.id, a.id);
    if (sort === "comments") return (commentCounts[b.id] ?? 0) - (commentCounts[a.id] ?? 0) || byDate;
    if (sort === "rating") return b.rating - a.rating || byDate;
    return (b.viewCount ?? 0) - (a.viewCount ?? 0) || byDate;
  });
}

export function searchMedia(items: MediaItem[], query: string): MediaItem[] {
  if (!query) return items;
  const needle = query.toLowerCase();
  return items.filter((item) => `${item.title ?? ""} ${item.fileName} ${item.comment} ${item.tags.join(" ")}`.toLowerCase().includes(needle));
}

export function anniversaryMemories(items: MediaItem[], today: string): MediaItem[] {
  const year = today.slice(0, 4);
  const monthDay = today.slice(5);
  return items.filter((item) => item.takenAt?.slice(5) === monthDay && item.takenAt.slice(0, 4) !== year);
}
