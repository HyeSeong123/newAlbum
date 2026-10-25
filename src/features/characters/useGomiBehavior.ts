import { useEffect, useRef, useState } from "react";
import { GOMI_SLEEP_TOUCH_WINDOW_MS, gomiHomeMotion, gomiInteractionMotion, gomiMotionDuration, gomiSleepLine, gomiSleepReaction, isGomiAngry, isGomiSleeping, type GomiMotion } from "./gomiBehavior";
import type { CompanionAction } from "./companionActivities";

// Sleep poses stay local; Home persists only explicit relationship interactions.
export function useGomiBehavior(enabled: boolean, affection: number, today: string, characterId?: string) {
  const [motion, setMotion] = useState<GomiMotion>("idle");
  const [settledCharacter, setSettledCharacter] = useState<string | undefined>(undefined);
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
    setSettledCharacter(enabled ? characterId : undefined);
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
  function react(): { line?:string; sleeping:boolean; disturbed:boolean } {
    if (isGomiSleeping(rest.current)) {
      const now = Date.now();
      const touches = now - sleepTouches.current.lastAt <= GOMI_SLEEP_TOUCH_WINDOW_MS ? sleepTouches.current.count + 1 : 1;
      sleepTouches.current = { count:touches, lastAt:now };
      setMotion(gomiSleepReaction(rest.current, touches));
      setSequence(value => value + 1);
      return { line:gomiSleepLine(touches, affection), sleeping:true, disturbed:touches >= 3 };
    }
    setMotion(gomiInteractionMotion(affection, ++interactions.current));
    setSequence(value => value + 1);
    return { sleeping:false, disturbed:false };
  }
  function activity(action: CompanionAction) {
    if (!enabled) return { sleeping:false, disturbed:false };
    if (isGomiSleeping(rest.current)) {
      const disturbed = action !== "rest";
      sleepTouches.current = { count:disturbed ? 3 : 0, lastAt:Date.now() };
      setMotion(disturbed ? gomiSleepReaction(rest.current,3) : rest.current);
      setSequence(value => value + 1);
      return { sleeping:true, disturbed };
    }
    sleepTouches.current = { count:0, lastAt:0 };
    setMotion(gomiInteractionMotion(affection, ++interactions.current));
    setSequence(value => value + 1);
    return { sleeping:false, disturbed:false };
  }
  return { motion, sequence, react, activity, ready:!enabled || settledCharacter === characterId, sleeping:enabled && isGomiSleeping(rest.current), irritated:enabled && isGomiAngry(motion) };
}
