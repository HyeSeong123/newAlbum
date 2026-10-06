import { useEffect, useRef, useState } from "react";
import { GOMI_IDLE_MS, GOMI_SLEEP_MS, GOMI_STRETCH_MS, gomiInteractionMotion, gomiMotionDuration, gomiSleepMotion, isGomiSleeping, type GomiMotion } from "./gomiBehavior";

// Resting never writes character data. Only Home's existing talk handler awards affection.
export function useGomiBehavior(enabled: boolean, affection: number, characterId?: string) {
  const [motion, setMotion] = useState<GomiMotion>("idle");
  const [sequence, setSequence] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const interactions = useRef(0);
  const pendingReaction = useRef<GomiMotion | null>(null);
  useEffect(() => {
    interactions.current = 0;
    pendingReaction.current = null;
    setMotion("idle");
  }, [enabled, characterId]);
  useEffect(() => {
    const visibility = () => {
      setVisible(!document.hidden);
      setMotion("idle");
      pendingReaction.current = null;
      setSequence(value => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (!enabled || !visible) return;
    const duration = motion === "idle" ? GOMI_IDLE_MS : isGomiSleeping(motion) ? GOMI_SLEEP_MS
      : motion === "stretch" ? GOMI_STRETCH_MS : gomiMotionDuration(motion);
    const timer = window.setTimeout(() => {
      // Let the user finish a help dialog before Gomi begins another rest cycle.
      if ((motion === "idle" || isGomiSleeping(motion)) && document.querySelector('[role="dialog"][aria-modal="true"]')) {
        setSequence(value => value + 1);
        return;
      }
      if (motion === "idle") setMotion(gomiSleepMotion());
      else if (isGomiSleeping(motion)) setMotion("stretch");
      else if (motion === "stretch") {
        setMotion(pendingReaction.current || "idle");
        pendingReaction.current = null;
      } else setMotion("idle");
    }, duration);
    return () => window.clearTimeout(timer);
  }, [enabled, visible, motion, sequence]);
  function react() {
    const next = gomiInteractionMotion(affection, ++interactions.current);
    if (isGomiSleeping(motion)) {
      pendingReaction.current = next;
      setMotion("stretch");
    } else {
      pendingReaction.current = null;
      setMotion(next);
    }
    setSequence(value => value + 1);
  }
  return { motion, sequence, react };
}
