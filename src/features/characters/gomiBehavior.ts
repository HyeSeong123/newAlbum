import { gomiSleepingLine } from "./gomiAffinity";

export const GOMI_BOND_AFFECTION = 60;
export const GOMI_LICK_AFFECTION = 90;
export const GOMI_STRETCH_MS = 2_400;
export const GOMI_SLEEP_TOUCH_WINDOW_MS = 10_000;
export const GOMI_ANGRY_TOUCHES = 3;

export type GomiSleepMotion = "sleep-curled" | "sleep-stretched" | "sleep-cool" | "sleep-warm";
export type GomiMotion = "idle" | "avoid" | "cynical" | "rest-front" | "happy" | "sad" | "angry" | "grow" | GomiSleepMotion | `${GomiSleepMotion}-peek` | `${GomiSleepMotion}-angry` | "stretch" | "paw-wave" | "lick";
export const gomiMotionFrames: Record<GomiMotion, string[]> = {
  idle: ["/characters/gomi/idle.png"],
  avoid: ["/characters/gomi/avoid.png"],
  cynical: ["/characters/gomi/cynical.png"],
  "rest-front": ["/characters/gomi/rest-front.png"],
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
  if (roll < .2) return "idle";
  if (roll < .4) return "rest-front";
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
export function gomiFoodSequence(rest:GomiSleepMotion,energy:number):GomiMotion[]{
  return energy<=0?[rest]:[`${rest}-peek`,"rest-front","idle"];
}
export function gomiSleepLine(touches: number, affection = 0) {
  return gomiSleepingLine(touches, affection);
}
export function allowedGomiMotion(motion: GomiMotion, affection: number): GomiMotion {
  if (!gomiCanSpeak(affection) && ["idle", "cynical", "happy", "grow", "paw-wave", "lick"].includes(motion)) return "avoid";
  if (motion === "lick" && affection < GOMI_LICK_AFFECTION) return "cynical";
  if (["idle", "happy", "grow", "paw-wave"].includes(motion) && affection < GOMI_BOND_AFFECTION) return "cynical";
  return motion;
}
// Silence is an intentional choice, decided before starting any AI inference.
export function gomiCanSpeak(affection: number): boolean {
  return Number.isFinite(affection) && affection >= GOMI_BOND_AFFECTION;
}
export function gomiInteractionMotion(affection: number, interaction: number): GomiMotion {
  if (affection < GOMI_BOND_AFFECTION) return "avoid";
  const cycle: GomiMotion[] = affection < GOMI_LICK_AFFECTION
    ? ["cynical", "happy", "paw-wave"] : ["paw-wave", "lick", "happy", "cynical"];
  return cycle[Math.max(0, interaction - 1) % cycle.length];
}
export function gomiMotionDuration(motion: GomiMotion) {
  return motion === "cynical" || motion === "avoid" ? 1_800 : motion === "stretch" ? GOMI_STRETCH_MS : isGomiAngry(motion) ? 2_600 : motion.endsWith("-peek") ? 1_800
    : motion === "paw-wave" ? 2_200 : motion === "lick" ? 1_800 : 1_000;
}

// Distance is local to this Home visit. Keep the drawing centered and the
// surrounding touch target full-sized, even after many hesitant steps away.
export function gomiRetreatAnimation(sequence: number, reduced: boolean, current?: {scale:number;y:number}) {
  const step = Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0;
  const scaleAt = (index: number) => Number((1 - Math.min(4, index) * .12).toFixed(2));
  const to = scaleAt(step);
  const from = current ? Math.max(to, Math.min(1, current.scale)) : scaleAt(Math.max(0, step - 1));
  const height = (scale: number) => scale === 1 ? 0 : -(1 - scale) * 80;
  if (reduced) return {keyframes:{x:0,y:height(to),rotate:0,scaleX:to,scaleY:to},duration:0};
  const first = from + (to - from) / 3, second = from + (to - from) * 2 / 3;
  const scales = [from, first, first, second, second, to];
  const lift = from === to ? 0 : 1.8;
  return {keyframes:{x:0,rotate:0,scaleX:scales,scaleY:scales,
    y:[current?.y ?? height(from),height(first)-lift,height(first),height(second)-lift,height(second),height(to)]},duration:.9};
}
