import type { CompanionAction } from "./companionActivities";
import { brotherMotionAnimation, isBrotherSignature } from "./brothersMotion";

export type CompanionMotion = "idle" | "look-around" | "nod" | "stretch" | "sway" | "bounce" | CompanionAction;
export type CompanionHomePose = Extract<CompanionMotion, "look-around" | "nod" | "stretch" | "sway">;
const strengths: Record<string, readonly [number, number]> = {
  "soft-bounce":[10,2], "slow-sway":[3,4], "quiet-nod":[2,1], "playful-wiggle":[14,8],
  "fan-flutter":[4,6], "petal-nod":[5,2], "shy-peek":[3,3], "gentle-drift":[3,1],
  "berry-bob":[12,5], "neat-tilt":[2,3], "rose-turn":[6,7], "curious-tilt":[4,8],
  "shell-tuck":[2,4], "grain-wave":[8,6], "cozy-roll":[2,5], "peach-sway":[7,4],
  "bashful-peek":[7,3], "brother-wink":[5,6],
};
const reserved = new Set(["shy-peek","shell-tuck","bashful-peek","quiet-nod","gentle-drift","neat-tilt"]);
const homePoses = new Set<CompanionMotion>(["look-around","nod","stretch","sway"]);

// Unlike a momentary greeting, the chosen posture stays visible throughout this Home visit.
// Avoid repeating the previous visit's posture, even when the random source returns the same value.
export function companionHomeMotion(signature: string, random = Math.random, previous?: CompanionMotion | readonly CompanionMotion[]): CompanionHomePose {
  const choices: CompanionHomePose[] = reserved.has(signature)
    ? ["nod","look-around","sway","stretch"] : ["look-around","sway","stretch","nod"];
  const excluded = new Set<CompanionMotion>(previous === undefined ? [] : Array.isArray(previous) ? previous : [previous as CompanionMotion]);
  const pool = choices.filter(pose => !excluded.has(pose));
  const available = pool.length ? pool : choices;
  return available[Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))];
}
export function companionInteractionMotion(signature: string, interaction: number, resting = false): CompanionMotion {
  if (resting) return "nod";
  // The brothers have four distinct touch responses rather than a repeated squash.
  if (isBrotherSignature(signature)) {
    const gestures: CompanionMotion[] = signature === "bashful-peek"
      ? ["look-around", "bounce", "stretch", "sway"] : ["bounce", "sway", "stretch", "nod"];
    return gestures[Math.max(0, interaction - 1) % gestures.length];
  }
  const choices: CompanionMotion[] = reserved.has(signature) ? ["nod","sway","look-around"] : ["bounce","look-around","sway"];
  return choices[Math.max(0, interaction - 1) % choices.length];
}
export function companionMotionForAction(action: CompanionAction): CompanionMotion { return action; }
type Frames = Record<"x" | "y" | "rotate" | "scaleX" | "scaleY", number | number[]>;
export function companionMotionAnimation(motion: CompanionMotion, signature: string): { keyframes: Frames; duration: number; repeat: number } {
  if (isBrotherSignature(signature)) return brotherMotionAnimation(motion, signature);
  const [hop, tilt] = strengths[signature] || [4,2];
  const lean = Math.max(9, Math.min(15, hop + 4));
  const turn = Math.max(7, Math.min(12, tilt * 1.4));
  const keyframes: Frames = { x:0, y:0, rotate:0, scaleX:1, scaleY:1 };
  let duration = 2;
  switch (motion) {
    case "idle": Object.assign(keyframes,{ y:[0,-1.6,0],rotate:[0,tilt*.12,0],scaleY:[1,1.012,1] }); duration=4.8; break;
    // Distinct, lingering silhouettes rather than 2-pixel gestures that vanish after entry.
    // The first and last keyframes match so a looping pose never jumps or returns to neutral.
    case "look-around": Object.assign(keyframes,{ x:[-lean,-lean+4,-lean],rotate:[-turn,-turn+3,-turn] }); duration=3.4; break;
    case "nod": Object.assign(keyframes,{ y:[8,5,8],rotate:[3,1,3],scaleX:[1.07,1.08,1.07],scaleY:[.92,.95,.92] }); duration=3.1; break;
    case "stretch": Object.assign(keyframes,{ y:[-12,-16,-12],scaleX:[.90,.88,.90],scaleY:[1.14,1.18,1.14] }); duration=3.6; break;
    case "sway": Object.assign(keyframes,{ x:[lean,lean+3,lean],rotate:[turn,turn+3,turn] }); duration=3.8; break;
    case "bounce": Object.assign(keyframes,{ y:[0,-hop,0,-hop*.5,0],rotate:[0,-tilt*.5,tilt*.5,0] }); duration=1.1; break;
    case "walk": Object.assign(keyframes,{ x:[0,-7,7,0],y:[0,-3,0,-3,0],rotate:[0,-tilt*.5,tilt*.5,0] }); duration=2.2; break;
    case "treat": Object.assign(keyframes,{ y:[0,2,0,2,0],rotate:[0,-tilt*.3,tilt*.3,0],scaleY:[1,.97,1] }); duration=2; break;
    case "pet": Object.assign(keyframes,{ x:[0,4,0],rotate:[0,tilt,tilt,0],scaleX:[1,1.015,1] }); duration=1.7; break;
    case "play": Object.assign(keyframes,{ x:[0,-5,5,0],y:[0,-hop,0,-hop*.8,0],rotate:[0,-tilt,tilt,0] }); duration=1.7; break;
    case "rest": Object.assign(keyframes,{ y:[13,12,13],rotate:[-5,-5,-5],scaleX:[1.10,1.095,1.10],scaleY:[.86,.87,.86] }); duration=6; break;
  }
  return { keyframes, duration, repeat:motion === "idle" || motion === "rest" || homePoses.has(motion) ? Infinity : 0 };
}

// A reduced-motion setting removes movement, not the character's selected posture.
export function companionMotionStillFrame(motion: CompanionMotion, signature: string): Record<keyof Frames, number> {
  const frames = companionMotionAnimation(motion, signature).keyframes;
  const first = (frame: number | number[]) => Array.isArray(frame) ? frame[0] : frame;
  return { x:first(frames.x), y:first(frames.y), rotate:first(frames.rotate),
    scaleX:first(frames.scaleX), scaleY:first(frames.scaleY) };
}
