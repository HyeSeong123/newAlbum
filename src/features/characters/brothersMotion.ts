// Dedicated choreography for the pencil brothers: the younger leads with energy,
// the older reacts a beat later with restrained turns. Never squash the drawings.
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
  rest: pose([0, 1, 0], [2, 1, 2], [0, 1, 0], 5.2, true),
};

const sweetPotato: Record<BrotherGesture, BrotherPlan> = {
  idle: pose([0, 0, 0], [0, -1, 0], [0, -.4, 0], 5.5, true),
  "look-around": pose([5, 3, -4, 5], [1, 0, 1, 1], [3, 1, -2, 3], 5.2, true),
  nod: pose([-1, -1, -1], [3, 4, 3], [-2, -4, -2], 3.8, true),
  stretch: pose([1, 0, 1], [-5, -8, -5], [3, 1, 3], 4.5, true),
  sway: pose([-4, -1, -4], [0, -1, 0], [-3, -1, -3], 4.7, true),
  bounce: pose([0, 4, 0, -3, 0], [0, -17, 0, -7, 0], [0, 4, 0, -3, 0], 1.8),
  walk: pose([-18, -8, 5, 18, 6, 0], [0, -6, 0, -5, 0, 0], [-4, 4, -3, 4, 1, 0], 3.0),
  treat: pose([0, 8, 12, 0], [0, -5, -7, 0], [0, 3, 5, 0], 2.6),
  pet: pose([0, -6, -12, -7, 0], [0, 3, 4, 3, 0], [0, -3, -5, -3, 0], 2.5),
  play: pose([0, 8, 0, -9, 0], [0, -18, 0, -12, 0], [0, 6, 0, -5, 0], 3.1),
  rest: pose([-2, -3, -2], [3, 2, 3], [-2, -1, -2], 6.0, true),
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
