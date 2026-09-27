import type { MediaItem } from "../../types/media";
import type { LocationOverview } from "../../services/tauriMediaService";

// Browser preview has no DB aggregation. One pass replaces a scan per province.
export function browserLocationOverview(items: MediaItem[], names: Record<string, string>): LocationOverview {
  const regions = Object.entries(names).map(([code, name]) => ({ code, name, photos: 0, videos: 0 }));
  const byCode = new Map(regions.map(region => [region.code, region]));
  let total = 0;
  let unclassified = 0;
  for (const item of items) {
    if (item.fileType !== "image" && item.fileType !== "video") continue;
    total++;
    const region = item.regionCode ? byCode.get(item.regionCode) : undefined;
    if (!region) unclassified++;
    else if (item.fileType === "image") region.photos++;
    else region.videos++;
  }
  return { total, analyzed: total, pending: 0, failed: 0, unclassified, regions };
}

export function groupByMonth<T extends { takenAt: string | null }>(items: T[]): Array<{ month: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const month = item.takenAt?.slice(0, 7) ?? "날짜 없음";
    const entries = groups.get(month);
    if (entries) entries.push(item);
    else groups.set(month, [item]);
  }
  return [...groups].map(([month, entries]) => ({ month, items: entries }));
}
