import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { characterAsset, type CharacterDefinition } from "./models";
import { GomiVisual } from "./GomiVisual";
import { characterPortraits } from "./characterPortraits";
import type { GomiMotion } from "./gomiBehavior";
import { companionMotionAnimation, companionMotionStillFrame, type CompanionMotion } from "./companionBehavior";
import { isBrotherSignature } from "./brothersMotion";
import { BrothersEffects } from "./BrothersEffects";
import { BrothersVisual } from "./BrothersVisual";
import { isBrotherArtId } from "./brothersArt";

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
  const initialReduced = useReducedMotion();
  const brother = isBrotherArtId(definition.id);
  const [brotherReduced, setBrotherReduced] = useState(Boolean(initialReduced));
  // The installed Motion hook snapshots this preference at mount. The new
  // illustrated frame loops also need to stop when the OS setting changes live.
  useEffect(() => {
    if (!brother) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setBrotherReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [brother]);
  const reduced = brother ? brotherReduced : initialReduced;
  const controls = useAnimationControls();
  const currentStage = definition.fixedGrowthStage || Math.max(1, Math.min(definition.maxStage, stage));
  const signature = definition.personality?.signatureAnimation || "soft-bounce";
  const excited = expression === "happy" || expression === "grow";
  const activeMotion = companionMotion || (excited ? "bounce" : "idle");
  const playbackMotion = expression === "sad" && !companionMotion ? "rest" : activeMotion;
  const brotherSignature = companionMotion && (definition.id === "potato" || definition.id === "sweet-potato") && isBrotherSignature(signature)
    ? signature : undefined;
  const portrait = characterPortraits[definition.id];
  useEffect(() => {
    if (paused) { controls.stop(); return; }
    // Replay the motion, keeping the decoded portrait and SVG clip in place.
    const plan = companionMotionAnimation(playbackMotion,signature);
    void controls.start(reduced ? companionMotionStillFrame(playbackMotion,signature) : plan.keyframes,
      reduced ? { duration:0 } : { duration:plan.duration,repeat:plan.repeat,ease:"easeInOut" });
    return () => controls.stop();
  }, [controls,reduced,playbackMotion,signature,currentStage,reactionKey,paused]);
  return <span className={`characterVisual characterVisual--${definition.type} characterMotion--${signature} ${className}`.trim()}
    data-character={definition.type} data-stage={currentStage} data-expression={expression} data-motion={activeMotion} data-paused={paused} data-reduced-motion={Boolean(reduced)}
    data-motion-style={brotherSignature ? "brothers" : undefined}>
    {brotherSignature && <BrothersEffects signature={brotherSignature} gesture={playbackMotion} reactionKey={reactionKey} paused={paused} reduced={Boolean(reduced)} />}
    <motion.span className="characterBody"
      initial={false} style={{ transformOrigin: "50% 84%" }}
      animate={controls}>
      {isBrotherArtId(definition.id) && portrait ? <BrothersVisual id={definition.id} stage={currentStage} motion={playbackMotion}
        poster={portrait} subject={definition.defaultName} expression={expression} reactionKey={reactionKey} paused={paused} reduced={Boolean(reduced)} /> :
        <img className="characterIllustration characterPortrait" src={portrait || characterAsset(definition, currentStage, expression)}
          data-portrait={definition.defaultName} data-stage={currentStage} data-expression={expression}
          alt="" draggable={false} width={220} height={220} />}
    </motion.span>
    <AnimatePresence>{excited && activeMotion !== "rest" && !reduced && !paused && !brotherSignature && <motion.span key={reactionKey} className="characterHeart" aria-hidden="true"
      initial={{ opacity:0,y:6,scale:.6,rotate:-12 }} animate={{ opacity:[0,1,1,0],y:-28,scale:1,rotate:10 }}
      exit={{ opacity:0 }} transition={{ duration:1.1 }}>
      <svg viewBox="0 0 24 24"><path d="M12 21C7 17 2 13 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 5-5 9-10 13Z" fill="currentColor" /></svg>
    </motion.span>}</AnimatePresence>
  </span>;
}
