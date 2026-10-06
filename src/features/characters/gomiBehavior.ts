export const GOMI_BOND_AFFECTION = 20;
export const GOMI_STRETCH_MS = 2_400;
export const GOMI_SLEEP_TOUCH_WINDOW_MS = 10_000;
export const GOMI_ANGRY_TOUCHES = 3;

export type GomiSleepMotion = "sleep-curled" | "sleep-stretched" | "sleep-cool" | "sleep-warm";
export type GomiMotion = "idle" | "happy" | "sad" | "angry" | "grow" | GomiSleepMotion | `${GomiSleepMotion}-peek` | `${GomiSleepMotion}-angry` | "stretch" | "paw-wave" | "lick";
export const gomiMotionFrames: Record<GomiMotion, string[]> = {
  idle: ["/characters/gomi/idle.png"],
  happy: ["/characters/gomi/happy.png"],
  sad: ["/characters/gomi/sad.png"],
  angry: ["/characters/gomi/angry.png"],
  grow: ["/characters/gomi/happy.png"],
  "sleep-curled": ["/characters/gomi/sleep-curled.png"],
  "sleep-stretched": ["/characters/gomi/sleep-stretched.png"],
  "sleep-cool": ["/characters/gomi/sleep-cool.png"],
  "sleep-warm": ["/characters/gomi/sleep-warm.png"],
  "sleep-curled-peek": ["/characters/gomi/sleep-curled-peek.png"],
  "sleep-curled-angry": ["/characters/gomi/sleep-curled-angry.png"],
  "sleep-stretched-peek": ["/characters/gomi/sleep-stretched-peek.png"],
  "sleep-stretched-angry": ["/characters/gomi/sleep-stretched-angry.png"],
  "sleep-cool-peek": ["/characters/gomi/sleep-cool-peek.png"],
  "sleep-cool-angry": ["/characters/gomi/sleep-cool-angry.png"],
  "sleep-warm-peek": ["/characters/gomi/sleep-warm-peek.png"],
  "sleep-warm-angry": ["/characters/gomi/sleep-warm-angry.png"],
  stretch: ["/characters/gomi/stretch.png"],
  "paw-wave": ["/characters/gomi/paw-wave-up.png", "/characters/gomi/paw-wave-down.png"],
  lick: ["/characters/gomi/lick.png", "/characters/gomi/happy.png"],
};
export function isGomiSleeping(motion: GomiMotion): motion is GomiSleepMotion {
  return ["sleep-curled", "sleep-stretched", "sleep-cool", "sleep-warm"].includes(motion);
}
export function isGomiSleepReaction(motion: GomiMotion) {
  return motion.startsWith("sleep-") && !isGomiSleeping(motion);
}
export function isGomiAngry(motion: GomiMotion) {
  return motion === "angry" || motion.endsWith("-angry");
}
export function gomiSeason(today: string): "cool" | "warm" | "none" {
  const month = Number(today.split("-")[1]);
  return month >= 5 && month <= 9 ? "cool" : (month >= 10 && month <= 12) || (month >= 1 && month <= 2) ? "warm" : "none";
}
// One draw on Home entry; staying on Home never starts another pose cycle.
export function gomiHomeMotion(today: string, random = Math.random): GomiMotion {
  const roll = random();
  if (roll < .4) return "idle";
  if (roll < .6) return "sleep-curled";
  if (roll < .7) return "sleep-stretched";
  if (roll < .9) {
    const season = gomiSeason(today);
    return season === "cool" ? "sleep-cool" : season === "warm" ? "sleep-warm" : "sleep-curled";
  }
  return "stretch";
}
export function gomiSleepReaction(rest: GomiSleepMotion, touches: number): GomiMotion {
  return `${rest}-${touches >= GOMI_ANGRY_TOUCHES ? "angry" : "peek"}`;
}
export function gomiSleepLine(touches: number) {
  if (touches === 1) return "…응? 나 아직 자는 중이야.";
  if (touches === 2) return "한 번 봐줬잖아. 조금만 더 잘게.";
  return touches % 2 ? "그만 톡톡 해. 나 자고 있잖아." : "내 잠은 소중하거든. 조금만 조용히 해줘.";
}
export function allowedGomiMotion(motion: GomiMotion, affection: number): GomiMotion {
  return (motion === "paw-wave" || motion === "lick") && affection < GOMI_BOND_AFFECTION ? "happy" : motion;
}
export function gomiInteractionMotion(affection: number, interaction: number): GomiMotion {
  if (affection < GOMI_BOND_AFFECTION) return "happy";
  return (["paw-wave", "lick", "happy"] as const)[(interaction - 1) % 3];
}
export function gomiMotionDuration(motion: GomiMotion) {
  return motion === "stretch" ? GOMI_STRETCH_MS : isGomiAngry(motion) ? 2_600 : motion.endsWith("-peek") ? 1_800
    : motion === "paw-wave" ? 2_200 : motion === "lick" ? 1_800 : 1_000;
}
