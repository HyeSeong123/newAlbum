import { BookHeart, createLucideIcon, Droplet, Paintbrush, Sun, type LucideIcon } from "lucide-react";
import type { SpecialActivityIcon } from "../characters/companionActivities";

const MakgeolliPour = createLucideIcon("MakgeolliPour", [
  ["path", { d:"M3 6l5-2 3 4-1 4-5 3a2 2 0 0 1-3-2l1-7Z", key:"jug" }],
  ["path", { d:"m8 4 5 1-2 3m2 0v4m2 0v2", key:"pour" }],
  ["path", { d:"M12 17h10a5 5 0 0 1-10 0Z", key:"bowl" }],
]);

const Gat = createLucideIcon("Gat", [
  ["path", { d:"m7.5 13 1.2-7a1 1 0 0 1 1-.8h4.6a1 1 0 0 1 1 .8l1.2 7", key:"crown" }],
  ["ellipse", { cx:"12", cy:"14", rx:"10", ry:"2.5", key:"brim" }],
  ["path", { d:"m9 17 3 4 3-4", key:"strings" }],
]);

const JanggiPiece = createLucideIcon("JanggiPiece", [
  ["path", { d:"M8 2h8l6 6v8l-6 6H8l-6-6V8Z", key:"piece" }],
  ["path", { d:"M7 7h10M8 10h8v5H8zM6 18h12M12 6v14", key:"chariot" }],
]);

export const specialActivityIcons: Record<SpecialActivityIcon, LucideIcon> = {
  water: Droplet,
  sun: Sun,
  "love-story": BookHeart,
  makgeolli: MakgeolliPour,
  gat: Gat,
  janggi: JanggiPiece,
  calligraphy: Paintbrush,
};
