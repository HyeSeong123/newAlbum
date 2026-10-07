import { useEffect, useRef, useState } from "react";
import { GOMI_SLEEP_TOUCH_WINDOW_MS, gomiHomeMotion, gomiInteractionMotion, gomiMotionDuration, gomiSleepLine, gomiSleepReaction, isGomiSleeping, type GomiMotion } from "./gomiBehavior";

// Resting never writes character data. Only Home's existing talk handler awards affection.
export function useGomiBehavior(enabled: boolean, affection: number, today: string, characterId?: string) {
  const [motion, setMotion] = useState<GomiMotion>("idle");
  const [sequence, setSequence] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const rest = useRef<GomiMotion>("idle");
  const entryDate = useRef(today);
  entryDate.current = today;
  const interactions = useRef(0);
  const sleepTouches = useRef({ count:0, lastAt:0 });
  useEffect(() => {
    interactions.current = 0;
    sleepTouches.current = { count:0, lastAt:0 };
    const initial = enabled ? gomiHomeMotion(entryDate.current) : "idle";
    rest.current = initial === "stretch" ? "idle" : initial;
    setMotion(initial);
  }, [enabled, characterId]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (!enabled || !visible || motion === rest.current) return;
    const timer = window.setTimeout(() => setMotion(rest.current), gomiMotionDuration(motion));
    return () => window.clearTimeout(timer);
  }, [enabled, visible, motion, sequence]);
  function react(): string | undefined {
    if (isGomiSleeping(rest.current)) {
      const now = Date.now();
      const touches = now - sleepTouches.current.lastAt <= GOMI_SLEEP_TOUCH_WINDOW_MS ? sleepTouches.current.count + 1 : 1;
      sleepTouches.current = { count:touches, lastAt:now };
      setMotion(gomiSleepReaction(rest.current, touches));
      setSequence(value => value + 1);
      return gomiSleepLine(touches, affection);
    }
    setMotion(gomiInteractionMotion(affection, ++interactions.current));
    setSequence(value => value + 1);
  }
  return { motion, sequence, react };
}
