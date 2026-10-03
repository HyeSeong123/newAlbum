import type { MediaItem } from "../../types/media";
import type { LocationOverview } from "../../services/tauriMediaService";
import type { RegionFilters, RegionPage } from "../../services/tauriMediaService";
import { REGION_NAMES } from "./regions";

export const REGION_ALBUM_LIMIT = 48;

export function orderRegionMedia(items: MediaItem[], oldest: boolean): MediaItem[] {
  return [...items].sort((a, b) => {
    if (!a.takenAt && b.takenAt) return 1;
    if (a.takenAt && !b.takenAt) return -1;
    const order = (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.id.localeCompare(b.id, undefined, { numeric: true });
    return oldest ? order : -order;
  });
}

export function browserRegionPage(items: MediaItem[], code: string, offset: number, filters: RegionFilters): RegionPage {
  const scoped = items.filter(item => item.fileType !== "audio" && (code === "unclassified"
    ? !item.regionCode || !REGION_NAMES[item.regionCode] : item.regionCode === code));
  const years = [...new Set(scoped.flatMap(item => /^\d{4}-/.test(item.takenAt ?? "") ? [item.takenAt!.slice(0, 4)] : []))].sort().reverse();
  const filtered = scoped.filter(item => (filters.fileType === "all" || item.fileType === filters.fileType)
    && (!filters.year || item.takenAt?.slice(0,4) === filters.year)
    && (!filters.district || (item.district || "__unset__") === filters.district));
  const byPlace = orderRegionMedia(filtered, filters.oldest).sort((a, b) => {
    const first = placeOrderKey(a, code), second = placeOrderKey(b, code);
    return first < second ? -1 : first > second ? 1 : 0;
  });
  return { items: byPlace.slice(offset, offset + 48), total: filtered.length, years };
}

function placeOrderKey(item: Pick<MediaItem, "district" | "country" | "city">, regionCode: string): string {
  if (regionCode === "unclassified") return "";
  if (regionCode === "overseas") return `${item.country?.trim() || "\uffff"}\0${item.city?.trim() || "\uffff"}`;
  return item.district?.trim() || "\uffff";
}

// Browser preview has no DB aggregation. One pass replaces a scan per province.
export function browserLocationOverview(items: MediaItem[], names: Record<string, string>): LocationOverview {
  const regions = [...Object.entries(names), ["overseas", "해외"]].map(([code, name]) => ({ code, name, photos: 0, videos: 0 }));
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

export function groupByDistrict<T extends { district?: string; country?: string; city?: string }>(items: T[], regionCode: string): Array<{ place: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const place = regionCode === "unclassified" ? "" : regionCode === "overseas"
      ? [item.country, item.city].filter(Boolean).join(" · ") || "도시 미지정"
      : item.district?.trim().replace(/시(?=[^ ]+구$)/, "시 ") || "시·군·구 미확인";
    const entries = groups.get(place);
    if (entries) entries.push(item);
    else groups.set(place, [item]);
  }
  return [...groups].map(([place, entries]) => ({ place, items: entries }));
}
