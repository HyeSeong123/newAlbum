export const GOMI_BOND_AFFECTION = 20;
export const GOMI_IDLE_MS = 24_000;
export const GOMI_SLEEP_MS = 42_000;
export const GOMI_STRETCH_MS = 2_400;

export type GomiMotion = "idle" | "happy" | "sad" | "grow" | "sleep-curled" | "sleep-stretched" | "stretch" | "paw-wave" | "lick";
export const gomiMotionFrames: Record<GomiMotion, string[]> = {
  idle: ["/characters/gomi/idle.png"],
  happy: ["/characters/gomi/happy.png"],
  sad: ["/characters/gomi/sad.png"],
  grow: ["/characters/gomi/happy.png"],
  "sleep-curled": ["/characters/gomi/sleep-curled.png"],
  "sleep-stretched": ["/characters/gomi/sleep-stretched.png"],
  stretch: ["/characters/gomi/stretch.png"],
  "paw-wave": ["/characters/gomi/paw-wave-up.png", "/characters/gomi/paw-wave-down.png"],
  lick: ["/characters/gomi/lick.png", "/characters/gomi/happy.png"],
};
export function isGomiSleeping(motion: GomiMotion) {
  return motion === "sleep-curled" || motion === "sleep-stretched";
}
export function allowedGomiMotion(motion: GomiMotion, affection: number): GomiMotion {
  return (motion === "paw-wave" || motion === "lick") && affection < GOMI_BOND_AFFECTION ? "happy" : motion;
}
export function gomiSleepMotion(random = Math.random): GomiMotion {
  return random() < .75 ? "sleep-curled" : "sleep-stretched";
}
export function gomiInteractionMotion(affection: number, interaction: number): GomiMotion {
  if (affection < GOMI_BOND_AFFECTION) return "happy";
  return (["paw-wave", "lick", "happy"] as const)[(interaction - 1) % 3];
}
export function gomiMotionDuration(motion: GomiMotion) {
  return motion === "paw-wave" ? 2_200 : motion === "lick" ? 1_800 : 1_000;
}
