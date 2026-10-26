import type { CompanionAction } from "./companionActivities";

export type CompanionMotion = "idle" | "look-around" | "nod" | "stretch" | "sway" | "bounce" | CompanionAction;
const strengths: Record<string, readonly [number, number]> = {
  "soft-bounce":[10,2], "slow-sway":[3,4], "quiet-nod":[2,1], "playful-wiggle":[14,8],
  "fan-flutter":[4,6], "petal-nod":[5,2], "shy-peek":[3,3], "gentle-drift":[3,1],
  "berry-bob":[12,5], "neat-tilt":[2,3], "rose-turn":[6,7], "curious-tilt":[4,8],
  "shell-tuck":[2,4], "grain-wave":[8,6], "cozy-roll":[2,5], "peach-sway":[7,4],
  "bashful-peek":[7,3], "brother-wink":[5,6],
};
const reserved = new Set(["shy-peek","shell-tuck","bashful-peek","quiet-nod","gentle-drift","neat-tilt"]);
export function companionHomeMotion(signature: string, random = Math.random): CompanionMotion {
  const choices: CompanionMotion[] = reserved.has(signature)
    ? ["nod","look-around","sway","stretch"] : ["look-around","sway","stretch","nod"];
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}
export function companionInteractionMotion(signature: string, interaction: number, resting = false): CompanionMotion {
  if (resting) return "nod";
  const choices: CompanionMotion[] = reserved.has(signature) ? ["nod","sway","look-around"] : ["bounce","look-around","sway"];
  return choices[Math.max(0, interaction - 1) % choices.length];
}
export function companionMotionForAction(action: CompanionAction): CompanionMotion { return action; }
type Frames = Record<"x" | "y" | "rotate" | "scaleX" | "scaleY", number | number[]>;
export function companionMotionAnimation(motion: CompanionMotion, signature: string): { keyframes: Frames; duration: number; repeat: number } {
  const [hop, tilt] = strengths[signature] || [4,2];
  const keyframes: Frames = { x:0, y:0, rotate:0, scaleX:1, scaleY:1 };
  let duration = 2;
  switch (motion) {
    case "idle": Object.assign(keyframes,{ y:[0,-1.6,0],rotate:[0,tilt*.12,0],scaleY:[1,1.012,1] }); duration=4.8; break;
    case "look-around": Object.assign(keyframes,{ x:[0,-2,2,0],rotate:[0,-tilt,tilt,0] }); duration=2.8; break;
    case "nod": Object.assign(keyframes,{ y:[0,3,0,2,0],rotate:[0,tilt*.25,0],scaleY:[1,.98,1] }); duration=1.8; break;
    case "stretch": Object.assign(keyframes,{ y:[0,-2,0],scaleX:[1,.97,1.04,1],scaleY:[1,1.06,.98,1] }); duration=2.6; break;
    case "sway": Object.assign(keyframes,{ x:[0,-3,3,0],rotate:[0,-tilt*.7,tilt*.7,0] }); duration=2.5; break;
    case "bounce": Object.assign(keyframes,{ y:[0,-hop,0,-hop*.5,0],rotate:[0,-tilt*.5,tilt*.5,0] }); duration=1.1; break;
    case "walk": Object.assign(keyframes,{ x:[0,-7,7,0],y:[0,-3,0,-3,0],rotate:[0,-tilt*.5,tilt*.5,0] }); duration=2.2; break;
    case "treat": Object.assign(keyframes,{ y:[0,2,0,2,0],rotate:[0,-tilt*.3,tilt*.3,0],scaleY:[1,.97,1] }); duration=2; break;
    case "pet": Object.assign(keyframes,{ x:[0,4,0],rotate:[0,tilt,tilt,0],scaleX:[1,1.015,1] }); duration=1.7; break;
    case "play": Object.assign(keyframes,{ x:[0,-5,5,0],y:[0,-hop,0,-hop*.8,0],rotate:[0,-tilt,tilt,0] }); duration=1.7; break;
    case "rest": Object.assign(keyframes,{ y:[0,.8,0],scaleY:[1,1.008,1] }); duration=6; break;
  }
  return { keyframes, duration, repeat:motion === "idle" || motion === "rest" ? Infinity : 0 };
}
