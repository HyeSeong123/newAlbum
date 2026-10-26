import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useId } from "react";
import { characterAsset, type CharacterDefinition } from "./models";
import { GomiVisual } from "./GomiVisual";
import { characterPortraits } from "./characterPortraits";
import type { GomiMotion } from "./gomiBehavior";
import { companionMotionAnimation, type CompanionMotion } from "./companionBehavior";

export type Expression = "idle" | "happy" | "sad" | "grow";
type CharacterVisualProps = {
  definition: CharacterDefinition; stage: number; expression?: Expression; className?: string; reactionKey?: number;
  gomiMotion?: GomiMotion; affection?: number;
  companionMotion?: CompanionMotion; paused?: boolean;
};
export function CharacterVisual(props: CharacterVisualProps) {
  if (props.definition.type === "gomi") return <GomiVisual motion={props.gomiMotion || props.expression}
    affection={props.affection} className={props.className} reactionKey={props.reactionKey} />;
  return <BotanicalVisual {...props} />;
}
function BotanicalVisual({ definition, stage, expression = "idle", className = "", reactionKey = 0, companionMotion, paused = false }: CharacterVisualProps) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const currentStage = definition.fixedGrowthStage || Math.max(1, Math.min(definition.maxStage, stage));
  const signature = definition.personality?.signatureAnimation || "soft-bounce";
  const excited = expression === "happy" || expression === "grow";
  const activeMotion = companionMotion || (excited ? "bounce" : "idle");
  const playbackMotion = expression === "sad" && !companionMotion ? "rest" : activeMotion;
  const src = characterAsset(definition, currentStage, expression);
  const portrait = characterPortraits[definition.id];
  const clipId = useId();
  const crop = portrait?.viewBox.split(" ").map(Number);
  useEffect(() => {
    if (paused) { controls.stop(); return; }
    // Replay the motion, keeping the decoded portrait and SVG clip in place.
    const plan = companionMotionAnimation(playbackMotion,signature);
    void controls.start(reduced ? { x:0,y:0,rotate:0,scaleX:1,scaleY:1 } : plan.keyframes,
      reduced ? { duration:0 } : { duration:plan.duration,repeat:plan.repeat,ease:"easeInOut" });
    return () => controls.stop();
  }, [controls,reduced,playbackMotion,signature,currentStage,reactionKey,paused]);
  return <span className={`characterVisual characterVisual--${definition.type} characterMotion--${signature} ${className}`.trim()}
    data-character={definition.type} data-stage={currentStage} data-expression={expression} data-motion={activeMotion} data-paused={paused} data-reduced-motion={Boolean(reduced)}>
    <motion.span className="characterBody"
      initial={false} style={{ transformOrigin: "50% 84%" }}
      animate={controls}>
      {portrait && crop ? <svg className="characterIllustration characterPortrait" viewBox={portrait.viewBox} data-portrait={portrait.subject}
        data-stage={currentStage} data-expression={expression} aria-hidden="true" width={220} height={220} overflow="hidden">
        <defs><clipPath id={clipId}>{portrait.clip ? <polygon points={portrait.clip} /> : <rect x={crop[0]} y={crop[1]} width={crop[2]} height={crop[3]} />}</clipPath></defs>
        <image href={portrait.src} width={portrait.width} height={portrait.height} clipPath={`url(#${clipId})`} /></svg> :
        <img className="characterIllustration" src={src} data-stage={currentStage} data-expression={expression}
          alt="" draggable={false} width={220} height={220} />}
    </motion.span>
    <AnimatePresence>{excited && activeMotion !== "rest" && !reduced && !paused && <motion.span key={reactionKey} className="characterHeart" aria-hidden="true"
      initial={{ opacity:0,y:6,scale:.6,rotate:-12 }} animate={{ opacity:[0,1,1,0],y:-28,scale:1,rotate:10 }}
      exit={{ opacity:0 }} transition={{ duration:1.1 }}>
      <svg viewBox="0 0 24 24"><path d="M12 21C7 17 2 13 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 5-5 9-10 13Z" fill="currentColor" /></svg>
    </motion.span>}</AnimatePresence>
  </span>;
}
