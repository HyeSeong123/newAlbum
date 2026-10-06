import { useEffect, useState } from "react";
import { AnimatePresence, motion as animated, useReducedMotion } from "motion/react";
import { allowedGomiMotion, gomiMotionFrames, isGomiAngry, isGomiSleeping, isGomiSleepReaction, type GomiMotion } from "./gomiBehavior";

export function GomiVisual({ motion = "idle", affection = 0, className = "", reactionKey = 0 }: {
  motion?: GomiMotion; affection?: number; className?: string; reactionKey?: number;
}) {
  const reduced = useReducedMotion();
  const action = allowedGomiMotion(motion, affection);
  const frames = gomiMotionFrames[action];
  const [frame, setFrame] = useState(0);
  const sleeping = isGomiSleeping(action);
  const sleepReaction = isGomiSleepReaction(action);
  const angry = isGomiAngry(action);
  useEffect(() => {
    setFrame(0);
    if (frames.length < 2 || reduced) return;
    // Load both drawings before alternating so the first paw/tongue movement cannot flash.
    let active = true;
    let timer: number | undefined;
    void Promise.all(frames.map(src => {
      const image = new Image(); image.src = src;
      return image.decode().catch(() => undefined);
    })).then(() => {
      if (active) timer = window.setInterval(() => setFrame(value => (value + 1) % frames.length), action === "lick" ? 230 : 180);
    });
    return () => { active = false; window.clearInterval(timer); };
  }, [frames, action, reduced, reactionKey]);
  const expression = angry ? "angry" : action.endsWith("-peek") ? "peek" : action === "idle" || sleeping || action === "stretch" ? "idle" : action === "sad" ? "sad" : "happy";
  return <span className={`characterVisual characterVisual--gomi characterMotion--poised-ear-tilt ${className}`.trim()}
    data-character="gomi" data-stage="6" data-expression={expression} data-motion={action} data-frame={reduced ? 0 : frame}
    data-reduced-motion={Boolean(reduced)}>
    <AnimatePresence initial={false} mode="wait"><animated.span className="characterBody gomiBody" key={`${action}:${reactionKey}`}
      initial={reduced ? false : { opacity:0 }} exit={{ opacity:0, transition:{ duration:reduced ? 0 : .12, repeat:0 } }}
      style={{ transformOrigin: "50% 90%" }}
      animate={reduced ? { opacity:1, y:0, rotate:0, scaleX:1, scaleY:1 } : sleeping
        ? { opacity:1, y:[0,-.5,0], rotate:0, scaleX:[1,1.012,1], scaleY:[1,1.025,1] }
        : angry ? { opacity:1, y:0, rotate:[0,-.7,.7,0], scaleX:1, scaleY:1 }
        : sleepReaction ? { opacity:1, y:0, rotate:0, scaleX:1, scaleY:1 }
        : action === "stretch" ? { opacity:1, y:0, rotate:0, scaleX:[.98,1.04,1.04,1], scaleY:[1,.96,.96,1] }
        : action === "paw-wave" ? { opacity:1, y:[0,-1,0], rotate:[-.6,.6,-.6], scaleX:1, scaleY:1 }
        : action === "lick" ? { opacity:1, y:0, rotate:[0,-2,0], scaleX:1, scaleY:1 }
        : action === "happy" || action === "grow" ? { opacity:1, y:[0,-3,0], rotate:[0,-2,0], scaleX:1, scaleY:1 }
        : { opacity:1, y:[0,-1,0], rotate:[0,.4,0], scaleX:1, scaleY:1 }}
      transition={reduced ? { duration:0 } : angry || sleepReaction ? { duration:angry ? .35 : .2, repeat:0, ease:"easeInOut", opacity:{ duration:.16, repeat:0 } }
        : action === "stretch" ? { duration:2.4, ease:"easeInOut", opacity:{ duration:.16, repeat:0 } }
        : { duration:sleeping ? 3.8 : action === "paw-wave" ? .36 : action === "lick" ? .46 : 4.6, repeat:Infinity, ease:"easeInOut", opacity:{ duration:.16, repeat:0 } }}>
      <img className="characterIllustration gomiIllustration" src={frames[(reduced ? 0 : frame) % frames.length]}
        data-stage="6" data-expression={expression} alt="" draggable={false} width={220} height={220} />
    </animated.span></AnimatePresence>
  </span>;
}
