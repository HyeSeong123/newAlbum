import type { MediaItem } from "../../types/media";
import { recordDate } from "../media/recordDate";

export const MEMORY_TYPES = {
  today: { label:"몇 년 전 오늘", period:"오늘", empty:"오늘과 같은 날짜의 예전 기록이 아직 없습니다.",
    matches:(date: string, today: string) => date.slice(5) === today.slice(5),
    dateLabel:(year: string, today: string) => `${year}년 ${Number(today.slice(5,7))}월 ${Number(today.slice(8))}일` },
  month: { label:"몇 년 전 이번 달", period:"이번 달", empty:"이번 달에 남긴 예전 기록이 아직 없습니다.",
    matches:(date: string, today: string) => date.slice(5,7) === today.slice(5,7),
    dateLabel:(year: string, today: string) => `${year}년 ${Number(today.slice(5,7))}월` },
};
export type MemoryType = keyof typeof MEMORY_TYPES;
export type MemoryGroup = { id: string; title: string; dateLabel: string; year: string; items: MediaItem[] };
export function memoryGroups(items: MediaItem[], today: string, type: MemoryType): MemoryGroup[] {
  if (!recordDate(today)) return [];
  const definition = MEMORY_TYPES[type];
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const date = recordDate(item.takenAt);
    if (!date || date.slice(0,4) >= today.slice(0,4) || !definition.matches(date, today)) continue;
    const year = date.slice(0,4);
    const group = groups.get(year) ?? []; group.push(item); groups.set(year, group);
  }
  return [...groups].sort(([a],[b]) => b.localeCompare(a)).map(([year, entries]) => ({
    id:`${type}-${year}`, year, title:`${Number(today.slice(0,4)) - Number(year)}년 전 ${definition.period}`,
    dateLabel:definition.dateLabel(year, today),
    items:[...entries].sort((a,b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? "")),
  }));
}
