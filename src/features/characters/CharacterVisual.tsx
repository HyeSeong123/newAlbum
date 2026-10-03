import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { characterAsset, type CharacterDefinition } from "./models";

export type Expression = "idle" | "happy" | "sad" | "grow";
const reactions: Record<string, [number, number]> = {
  "soft-bounce": [10, 2], "slow-sway": [3, 4], "quiet-nod": [2, 1], "playful-wiggle": [14, 8],
  "fan-flutter": [4, 6], "petal-nod": [5, 2], "shy-peek": [3, 3], "gentle-drift": [3, 1],
  "berry-bob": [12, 5], "neat-tilt": [2, 3], "rose-turn": [6, 7], "curious-tilt": [4, 8],
  "shell-tuck": [2, 4], "grain-wave": [8, 6], "cozy-roll": [2, 5], "peach-sway": [7, 4],
  "bashful-peek": [7, 3], "brother-wink": [5, 6],
};
export function CharacterVisual({ definition, stage, expression = "idle", className = "", reactionKey = 0 }: {
  definition: CharacterDefinition; stage: number; expression?: Expression; className?: string; reactionKey?: number;
}) {
  const reduced = useReducedMotion();
  const currentStage = Math.max(1, Math.min(definition.maxStage, stage));
  const signature = definition.personality?.signatureAnimation || "soft-bounce";
  const [hop, tilt] = reactions[signature] || [4, 2];
  const excited = expression === "happy" || expression === "grow";
  const src = characterAsset(definition, currentStage, expression);
  const idleTilt = signature === "brother-wink" ? 1.5 : signature === "bashful-peek" ? -.8 : .6;
  const idleDuration = signature === "brother-wink" ? 5.4 : signature === "bashful-peek" ? 4.8 : 4.6;
  return <span className={`characterVisual characterVisual--${definition.type} characterMotion--${signature} ${className}`.trim()}
    data-character={definition.type} data-stage={currentStage} data-expression={expression} data-reduced-motion={Boolean(reduced)}>
    <motion.span key={`${currentStage}:${excited}:${excited ? reactionKey : 0}`} className="characterBody"
      initial={false} style={{ transformOrigin: "50% 84%" }}
      animate={reduced ? { y:0,rotate:0,scale:1 } : excited
        ? { y:[0,-hop,2,-hop*.35,0],rotate:[0,-tilt,tilt,-tilt*.3,0],scale:[1,1.025,.97,1.01,1] }
        : expression === "sad" ? { y:[0,2,0],rotate:[0,-tilt*.4,0],scale:[1,.995,1] }
        : { y:[0,-2,0],rotate:[0,idleTilt,0],scale:[1,1.012,1] }}
      transition={reduced ? { duration:0 } : excited ? { duration:.9,ease:"easeInOut" } : { duration:idleDuration,repeat:Infinity,ease:"easeInOut" }}>
      <img className="characterIllustration" src={src} data-stage={currentStage} data-expression={expression}
        alt="" draggable={false} width={220} height={220} />
    </motion.span>
    <AnimatePresence>{excited && !reduced && <motion.span key={reactionKey} className="characterHeart" aria-hidden="true"
      initial={{ opacity:0,y:6,scale:.6,rotate:-12 }} animate={{ opacity:[0,1,1,0],y:-28,scale:1,rotate:10 }}
      exit={{ opacity:0 }} transition={{ duration:1.1 }}>
      <svg viewBox="0 0 24 24"><path d="M12 21C7 17 2 13 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 5-5 9-10 13Z" fill="currentColor" /></svg>
    </motion.span>}</AnimatePresence>
  </span>;
}
