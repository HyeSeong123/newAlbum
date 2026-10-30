// Dedicated choreography for the two brothers. Their approved PNG portraits remain
// intact: change position/rotation and timing instead of squashing the drawings.
export type BrotherSignature = "bashful-peek" | "brother-wink";
export type BrotherGesture = "idle" | "look-around" | "nod" | "stretch" | "sway"
  | "bounce" | "walk" | "treat" | "pet" | "play" | "rest";
type Step = number | number[];
type Frames = Record<"x" | "y" | "rotate" | "scaleX" | "scaleY", Step>;
export type BrotherPlan = { keyframes: Frames; duration: number; repeat: number };
export type BrotherEffect = "none" | "curious" | "shine" | "steps" | "heart" | "stars" | "sleep";

const pose = (x: Step, y: Step, rotate: Step, duration: number, loop = false): BrotherPlan => ({
  keyframes: { x, y, rotate, scaleX: 1, scaleY: 1 }, duration, repeat: loop ? Infinity : 0,
});

const potato: Record<BrotherGesture, BrotherPlan> = {
  idle: pose([0, 0, 0], [0, -2, 0], [0, 1, 0], 5, true),
  "look-around": pose([-14, -5, 11, -14], [4, 1, 3, 4], [-11, -5, 8, -11], 4.6, true),
  nod: pose([0, 1, 0], [7, 10, 7], [7, 3, 7], 3.5, true),
  stretch: pose([0, -2, 0], [-15, -23, -15], [-3, 2, -3], 4.2, true),
  sway: pose([12, 5, 12], [1, -3, 1], [10, 3, 10], 4.4, true),
  bounce: pose([0, 4, 0, -3, 0], [0, -31, 0, -12, 0], [0, -9, 4, -3, 0], 1.6),
  walk: pose([-25, -13, 0, 13, 27, 0], [0, -14, 0, -16, 0, 0], [-9, 4, -6, 6, 0, 0], 2.8),
  treat: pose([0, -8, -6, 0], [0, -26, -18, 0], [0, -10, 8, 0], 2.3),
  pet: pose([0, 8, 13, 0], [0, 4, 7, 0], [0, 10, 15, 0], 2.1),
  play: pose([0, -13, 0, 17, 0], [0, -40, 0, -27, 0], [0, -17, 3, 17, 0], 2.9),
  rest: pose([5, 7, 5], [15, 14, 15], [15, 16, 15], 5.2, true),
};

const sweetPotato: Record<BrotherGesture, BrotherPlan> = {
  idle: pose([0, 0, 0], [0, -3, 0], [0, -1, 0], 5.5, true),
  "look-around": pose([13, 7, -10, 13], [2, 0, 2, 2], [10, 5, -8, 10], 5.2, true),
  nod: pose([-3, -2, -3], [5, 10, 5], [-8, -16, -8], 3.8, true),
  stretch: pose([4, 1, 4], [-13, -24, -13], [10, 3, 10], 4.5, true),
  sway: pose([-13, -2, -13], [1, -3, 1], [-13, -4, -13], 4.7, true),
  bounce: pose([0, 10, 0, -9, 0], [0, -35, 0, -16, 0], [0, 16, 0, -13, 0], 1.8),
  walk: pose([-29, -12, 8, 28, 10, 0], [0, -17, 0, -12, 0, 0], [-12, 12, -8, 12, 3, 0], 3.0),
  treat: pose([0, 11, 15, 0], [0, -16, -19, 0], [0, 19, 23, 0], 2.6),
  pet: pose([0, -8, -15, -9, 0], [0, 8, 11, 8, 0], [0, -12, -19, -12, 0], 2.5),
  play: pose([0, 18, 0, -19, 0], [0, -44, 0, -35, 0], [0, 27, 0, -25, 0], 3.1),
  rest: pose([-7, -9, -7], [13, 12, 13], [-16, -15, -16], 6.0, true),
};

export function isBrotherSignature(signature: string): signature is BrotherSignature {
  return signature === "bashful-peek" || signature === "brother-wink";
}
export function brotherMotionAnimation(motion: BrotherGesture, signature: BrotherSignature): BrotherPlan {
  return (signature === "bashful-peek" ? potato : sweetPotato)[motion];
}
export function brotherEffectForMotion(motion: BrotherGesture): BrotherEffect {
  switch (motion) {
    case "look-around": return "curious";
    case "stretch":
    case "treat": return "shine";
    case "walk": return "steps";
    case "pet": return "heart";
    case "bounce":
    case "play": return "stars";
    case "rest": return "sleep";
    default: return "none";
  }
}
