import type { LocationOverview } from "../../services/tauriMediaService";
import geography from "../../../data/korea-adm1.geojson?raw";

import { REGION_NAMES } from "./regions";
export { REGION_NAMES, REGION_LABELS } from "./regions";

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
export const MAP_REGIONS = collection.features.filter(feature => feature.properties.shapeISO !== "KR-29").map((feature) => {
  const combined = feature.properties.shapeISO === "KR-46" ? collection.features.filter(entry => ["KR-46", "KR-29"].includes(entry.properties.shapeISO)) : [feature];
  return { code: feature.properties.shapeISO, name: REGION_NAMES[feature.properties.shapeISO],
    path: combined.map(part => {
      const parts = part.geometry.type === "Polygon" ? [part.geometry.coordinates as Polygon] : part.geometry.coordinates as Polygon[];
      return parts.map(polygon => polygon.map(ringPath).join("")).join("");
    }).join("") };
});

export function totalFor(overview: LocationOverview | null, code: string): number {
  const region = overview?.regions.find(entry => entry.code === code);
  return (region?.photos ?? 0) + (region?.videos ?? 0);
}
