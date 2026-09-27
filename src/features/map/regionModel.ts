import type { LocationOverview } from "../../services/tauriMediaService";
import geography from "../../../data/korea-adm1.geojson?raw";

export const REGION_LABELS: Record<string, string> = {
  "KR-11": "서울", "KR-26": "부산", "KR-27": "대구", "KR-28": "인천", "KR-29": "광주",
  "KR-30": "대전", "KR-31": "울산", "KR-41": "경기", "KR-42": "강원", "KR-43": "충북",
  "KR-44": "충남", "KR-45": "전북", "KR-46": "전남", "KR-47": "경북", "KR-48": "경남",
  "KR-49": "제주", "KR-50": "세종",
};
export const REGION_NAMES: Record<string, string> = {
  "KR-11": "서울특별시", "KR-26": "부산광역시", "KR-27": "대구광역시", "KR-28": "인천광역시",
  "KR-29": "광주광역시", "KR-30": "대전광역시", "KR-31": "울산광역시", "KR-41": "경기도",
  "KR-42": "강원특별자치도", "KR-43": "충청북도", "KR-44": "충청남도", "KR-45": "전북특별자치도",
  "KR-46": "전라남도", "KR-47": "경상북도", "KR-48": "경상남도", "KR-49": "제주특별자치도",
  "KR-50": "세종특별자치시",
};

type Point = [number, number];
type Polygon = Point[][];
type Feature = { properties: { shapeISO: string }; geometry: { type: string; coordinates: Polygon | Polygon[] } };
const collection = JSON.parse(geography) as { features: Feature[] };
const project = ([lon, lat]: Point): Point => [(lon - 124.4) * 67, (39.1 - lat) * 81];
function ringPath(ring: Point[]): string {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("") + "Z";
}
export const MAP_REGIONS = collection.features.map((feature) => {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Polygon] : feature.geometry.coordinates as Polygon[];
  return { code: feature.properties.shapeISO, name: REGION_NAMES[feature.properties.shapeISO],
    path: polygons.map(polygon => polygon.map(ringPath).join("")).join("") };
});

export function totalFor(overview: LocationOverview | null, code: string): number {
  const region = overview?.regions.find(entry => entry.code === code);
  return (region?.photos ?? 0) + (region?.videos ?? 0);
}

export function groupByMonth<T extends { takenAt: string | null }>(items: T[]): Array<{ month: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const month = item.takenAt?.slice(0, 7) ?? "날짜 없음";
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  return [...groups].map(([month, entries]) => ({ month, items: entries }));
}
