import { useEffect, useState } from "react";
import { motion as animated, useAnimationControls, useReducedMotion } from "motion/react";
import { allowedGomiMotion, gomiMotionFrames, isGomiAngry, isGomiSleeping, isGomiSleepReaction, type GomiMotion } from "./gomiBehavior";

export function GomiVisual({ motion = "idle", affection = 0, className = "", reactionKey = 0 }: {
  motion?: GomiMotion; affection?: number; className?: string; reactionKey?: number;
}) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const action = allowedGomiMotion(motion, affection);
  const frames = gomiMotionFrames[action];
  const [picture, setPicture] = useState(() => ({ frames, frame:0 }));
  const sleeping = isGomiSleeping(action);
  const sleepReaction = isGomiSleepReaction(action);
  const angry = isGomiAngry(action);
  useEffect(() => {
    // Hold the last decoded pose until every drawing for the next pose is ready.
    let active = true;
    let timer: number | undefined;
    void Promise.all(frames.map(src => {
      const image = new Image(); image.src = src;
      return image.decode();
    })).then(() => {
      if (!active) return;
      setPicture({ frames, frame:0 });
      if (frames.length > 1 && !reduced) timer = window.setInterval(() => setPicture(value => ({ ...value, frame:(value.frame + 1) % value.frames.length })), action === "lick" ? 230 : 180);
    }).catch(() => { /* An unreadable replacement must not hide the current picture. */ });
    return () => { active = false; window.clearInterval(timer); };
  }, [frames, action, reduced, reactionKey]);
  useEffect(() => {
    void controls.start(reduced ? { y:0, rotate:0, scaleX:1, scaleY:1 } : sleeping
      ? { y:[0,-.5,0], rotate:0, scaleX:[1,1.012,1], scaleY:[1,1.025,1] }
      : action === "cynical" ? { y:0, rotate:0, scaleX:1, scaleY:1 }
      : action === "rest-front" ? { y:0, rotate:0, scaleX:1, scaleY:[1,1.006,1] }
      : angry ? { y:0, rotate:[0,-.7,.7,0], scaleX:1, scaleY:1 }
      : sleepReaction ? { y:0, rotate:0, scaleX:1, scaleY:1 }
      : action === "stretch" ? { y:0, rotate:0, scaleX:[.98,1.04,1.04,1], scaleY:[1,.96,.96,1] }
      : action === "paw-wave" ? { y:[0,-1,0], rotate:[-.6,.6,-.6], scaleX:1, scaleY:1 }
      : action === "lick" ? { y:0, rotate:[0,-2,0], scaleX:1, scaleY:1 }
      : action === "happy" || action === "grow" ? { y:[0,-3,0], rotate:[0,-2,0], scaleX:1, scaleY:1 }
      : { y:[0,-1,0], rotate:[0,.4,0], scaleX:1, scaleY:1 },
    reduced ? { duration:0 } : action === "cynical" || angry || sleepReaction ? { duration:angry ? .35 : .2, repeat:0, ease:"easeInOut" }
      : action === "stretch" ? { duration:2.4, ease:"easeInOut" }
      : { duration:sleeping ? 3.8 : action === "paw-wave" ? .36 : action === "lick" ? .46 : 4.6, repeat:Infinity, ease:"easeInOut" });
    return () => controls.stop();
  }, [controls, reduced, action, sleeping, angry, sleepReaction, reactionKey]);
  const expression = action === "cynical" || action === "rest-front" ? "cynical" : angry ? "angry" : action.endsWith("-peek") ? "peek" : action === "idle" || sleeping || action === "stretch" ? "idle" : action === "sad" ? "sad" : "happy";
  return <span className={`characterVisual characterVisual--gomi characterMotion--poised-ear-tilt ${className}`.trim()}
    data-character="gomi" data-stage="6" data-expression={expression} data-motion={action} data-frame={reduced ? 0 : picture.frame}
    data-reduced-motion={Boolean(reduced)}>
    <animated.span className="characterBody gomiBody" initial={false}
      style={{ transformOrigin: "50% 90%" }}
      animate={controls}>
      <img className="characterIllustration gomiIllustration" src={picture.frames[(reduced ? 0 : picture.frame) % picture.frames.length]}
        data-stage="6" data-expression={expression} alt="" draggable={false} width={220} height={220} />
    </animated.span>
  </span>;
}
