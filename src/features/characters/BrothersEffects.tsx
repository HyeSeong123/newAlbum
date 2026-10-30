import { AnimatePresence, motion } from "motion/react";
import { brotherEffectForMotion, type BrotherGesture, type BrotherSignature, type BrotherEffect } from "./brothersMotion";

function MotionMark({ type }: { type: Exclude<BrotherEffect, "none"> }) {
  if (type === "steps") return <svg viewBox="0 0 72 72" fill="currentColor" aria-hidden="true">
    <ellipse cx="16" cy="52" rx="9" ry="5" transform="rotate(-26 16 52)" />
    <circle cx="8" cy="40" r="2.8" /><circle cx="15" cy="37" r="2.8" /><circle cx="22" cy="40" r="2.5" />
    <ellipse cx="50" cy="33" rx="9" ry="5" transform="rotate(22 50 33)" />
    <circle cx="43" cy="21" r="2.8" /><circle cx="50" cy="18" r="2.8" /><circle cx="57" cy="21" r="2.5" />
  </svg>;
  if (type === "shine") return <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
    <circle cx="36" cy="36" r="14" fill="currentColor" fillOpacity=".22" />
    <path d="M36 8v8m0 40v8M8 36h8m40 0h8M16 16l6 6m28 28 6 6m0-40-6 6M22 50l-6 6" />
  </svg>;
  if (type === "heart") return <svg viewBox="0 0 72 72" aria-hidden="true">
    <path d="M36 58C27 51 13 42 13 29a13 13 0 0 1 23-8 13 13 0 0 1 23 8c0 13-14 22-23 29Z" fill="currentColor" opacity=".85" />
    <path d="M23 27c2-4 5-5 9-4" stroke="#fffdf8" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>;
  if (type === "stars") return <svg viewBox="0 0 72 72" fill="currentColor" aria-hidden="true">
    <path d="M27 9 32 25 48 30 32 35 27 51 22 35 6 30 22 25Z" />
    <path d="M57 35 61 44 70 48 61 52 57 61 53 52 44 48 53 44Z" opacity=".74" />
  </svg>;
  if (type === "sleep") return <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 48h22L10 64h22M36 26h22L36 42h22M51 9h15L51 20h15" />
  </svg>;
  return <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
    <path d="M18 22c0-12 10-18 20-17 11 1 18 8 18 18 0 12-15 14-17 22" />
    <circle cx="39" cy="59" r="4" fill="currentColor" stroke="none" />
  </svg>;
}

// Visual-only elements: never initiate a character interaction, persist data or call the model.
export function BrothersEffects({ signature, gesture, reactionKey, paused, reduced }: {
  signature: BrotherSignature; gesture: BrotherGesture; reactionKey: number; paused: boolean; reduced: boolean;
}) {
  const effect = brotherEffectForMotion(gesture);
  const animate = !paused && !reduced;
  const persistent = gesture === "look-around" || gesture === "stretch" || gesture === "rest";
  return <>
    <motion.span className="brotherGround" aria-hidden="true"
      animate={animate ? { scaleX: [1, .82, 1], opacity: [.34, .22, .34] } : { scaleX: 1, opacity: .34 }}
      transition={{ duration: 3.3, repeat: animate ? Infinity : 0, ease: "easeInOut" }} />
    <AnimatePresence initial={false}>
      {!paused && effect !== "none" && <motion.span key={effect + ":" + reactionKey}
        className={"brotherFx brotherFx--" + effect + " brotherFx--" + signature}
        data-brother-effect={effect} aria-hidden="true" initial={reduced ? false : { opacity: 0, y: 7 }}
        animate={reduced ? { opacity: 1, y: 0 } : { opacity: [.58, 1, .58], y: [5, -7, 5] }}
        exit={{ opacity: 0 }} transition={{ duration: persistent ? 3.6 : 1.5, repeat: animate && persistent ? Infinity : 0, ease: "easeInOut" }}>
        <MotionMark type={effect} />
      </motion.span>}
    </AnimatePresence>
  </>;
}
