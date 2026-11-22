import { BookHeart, createLucideIcon, Droplet, Sun, type LucideIcon } from "lucide-react";
import type { SpecialActivityIcon } from "../characters/companionActivities";

const MakgeolliPour = createLucideIcon("MakgeolliPour", [
  ["path", { d:"M3 6l5-2 3 4-1 4-5 3a2 2 0 0 1-3-2l1-7Z", key:"jug" }],
  ["path", { d:"m8 4 5 1-2 3m2 0v4m2 0v2", key:"pour" }],
  ["path", { d:"M12 17h10a5 5 0 0 1-10 0Z", key:"bowl" }],
]);

const NinjaTraining = createLucideIcon("NinjaTraining", [
  ["circle", { cx:"10", cy:"12", r:"8", key:"hood" }],
  ["path", { d:"M2.5 9.5h15m-15 5h15M6 12h1m5 0h1m4.5-2.5L22 6m-4 5 4 1", key:"headband" }],
]);

const JanggiPiece = createLucideIcon("JanggiPiece", [
  ["path", { d:"M8 2h8l6 6v8l-6 6H8l-6-6V8Z", key:"piece" }],
  ["path", { d:"M7 7h10M8 10h8v5H8zM6 18h12M12 6v14", key:"chariot" }],
]);

const InkBrush = createLucideIcon("InkBrush", [
  ["path", { d:"M8 12 19 2l2 2-10 11Z", key:"handle" }],
  ["path", { d:"M8 12c-4 1-4 5-6 9 4-1 8-2 9-6", key:"bristles" }],
  ["path", { d:"M13 21h7", key:"ink" }],
]);

export const specialActivityIcons: Record<SpecialActivityIcon, LucideIcon> = {
  water: Droplet,
  sun: Sun,
  "love-story": BookHeart,
  makgeolli: MakgeolliPour,
  training: NinjaTraining,
  janggi: JanggiPiece,
  calligraphy: InkBrush,
};
