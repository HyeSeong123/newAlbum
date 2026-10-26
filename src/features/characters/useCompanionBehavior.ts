import { useEffect, useRef, useState } from "react";
import { companionHomeMotion, companionInteractionMotion, companionMotionAnimation, companionMotionForAction, type CompanionMotion } from "./companionBehavior";
import type { CompanionAction } from "./companionActivities";

// Presentation only. No model requests, persisted sleep state or affection writes.
export function useCompanionBehavior(enabled: boolean, characterId?: string, signature = "soft-bounce") {
  const [state, setState] = useState<{ owner?: string; motion: CompanionMotion; sequence: number }>({ motion:"idle", sequence:0 });
  const [visible, setVisible] = useState(() => !document.hidden);
  const entered = useRef<string | undefined>(undefined);
  const rest = useRef<CompanionMotion>("idle");
  const interactions = useRef(0);
  useEffect(() => {
    if (!enabled || !characterId) { entered.current=undefined; return; }
    if (entered.current === characterId) return;
    entered.current=characterId; rest.current="idle"; interactions.current=0;
    setState({ owner:characterId,motion:companionHomeMotion(signature),sequence:0 });
  }, [enabled,characterId,signature]);
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange",onVisibility);
    return () => document.removeEventListener("visibilitychange",onVisibility);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !visible || state.owner !== characterId || state.motion === rest.current) return;
    const timer = window.setTimeout(() => setState(value => value.owner === state.owner && value.sequence === state.sequence
      ? { ...value,motion:rest.current } : value),
      companionMotionAnimation(state.motion,signature).duration * 1000);
    return () => window.clearTimeout(timer);
  }, [enabled,visible,characterId,signature,state.motion,state.owner,state.sequence]);
  function react() {
    if (!enabled || !characterId) return;
    const motion = companionInteractionMotion(signature,++interactions.current,rest.current === "rest");
    setState(value => ({ owner:characterId,motion,sequence:value.sequence+1 }));
  }
  function activity(action: CompanionAction) {
    if (!enabled || !characterId) return;
    rest.current=action === "rest" ? "rest" : "idle";
    setState(value => ({ owner:characterId,motion:companionMotionForAction(action),sequence:value.sequence+1 }));
  }
  return { motion:state.owner === characterId ? state.motion : "idle" as CompanionMotion,
    sequence:state.owner === characterId ? state.sequence : 0,paused:!visible,react,activity };
}
