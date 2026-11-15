import type { CompanionMotion } from "./companionBehavior";

export type BrotherArtId = "potato" | "sweet-potato";
type Expression = "idle" | "happy" | "sad" | "grow";
export const brotherArtAssets: Record<BrotherArtId, string> = {
  potato: "/characters/brothers-v2/potato-atlas.png",
  "sweet-potato": "/characters/brothers-v2/sweet-potato-atlas.png",
};
export const brotherArtPoses = ["idle", "blink", "smile", "cheer", "sad", "surprised", "skeptical", "bashful", "wave-low", "wave-high", "rest-awake", "sleep"] as const;
export function isBrotherArtId(id: string): id is BrotherArtId {
  return id === "potato" || id === "sweet-potato";
}

// Row-major cells in the original 4 x 3 PNG. The image is never recolored or resampled.
export function brotherArtFrame(id: BrotherArtId, motion: CompanionMotion, expression: Expression = "idle", elapsedMs = 0, reduced = false): number {
  const elapsed = !reduced && Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const sequence = (frames: readonly number[], interval = 320) => frames[Math.floor(elapsed / interval) % frames.length];
  if (expression === "sad") return 4;
  if (motion === "rest") return 11;
  const younger = id === "potato";
  switch (motion) {
    case "walk": return sequence([8, 9]);
    case "treat": return sequence(younger ? [2, 1, 2, 2] : [2, 7, 2, 2], 600);
    case "pet": return sequence(younger ? [2, 7] : [7, 2], 750);
    case "play": return sequence(younger ? [3, 5, 6, 2] : [6, 3, 6, 2], 650);
    case "bounce": return sequence(younger ? [2, 3] : [3, 2], 420);
    case "look-around": return sequence(younger ? [5, 0, 7, 0] : [6, 0, 6, 0], 1_100);
    case "nod": return 10;
    case "stretch": return 3;
    case "sway": return younger ? 7 : 6;
    default:
      if (expression === "happy" || expression === "grow") return younger ? 3 : 2;
      return elapsed % 5_200 >= 4_400 && elapsed % 5_200 < 4_650 ? 1 : 0;
  }
}

export function brotherArtViewBox(frame: number, width = 1448, height = 1086): string {
  const cell = Number.isFinite(frame) ? Math.max(0, Math.min(11, Math.floor(frame))) : 0;
  const w = (Number.isFinite(width) && width > 0 ? width : 1448) / 4;
  const h = (Number.isFinite(height) && height > 0 ? height : 1086) / 3;
  return [cell % 4 * w, Math.floor(cell / 4) * h, w, h].join(" ");
}
