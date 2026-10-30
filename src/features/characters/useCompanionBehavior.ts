import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { companionHomeMotion, companionInteractionMotion, companionMotionAnimation, companionMotionForAction, type CompanionMotion } from "./companionBehavior";
import type { CompanionAction } from "./companionActivities";

// Session-only memory. Navigation chooses a visibly different posture without touching SQLite,
// affection, AI sessions or the original character portrait.
const recentHomePoses = new Map<string, CompanionMotion[]>();

export function useCompanionBehavior(enabled: boolean, characterId?: string, signature = "soft-bounce") {
  const [state, setState] = useState<{ owner?: string; motion: CompanionMotion; sequence: number }>({ motion:"idle", sequence:0 });
  const [visible, setVisible] = useState(() => !document.hidden);
  const entered = useRef<string | undefined>(undefined);
  const homePose = useRef<CompanionMotion>("idle");
  const rest = useRef<CompanionMotion>("idle");
  const interactions = useRef(0);
  useEffect(() => {
    if (!enabled || !characterId) { entered.current=undefined; return; }
    if (entered.current === characterId) return;
    entered.current=characterId; interactions.current=0;
    const history=recentHomePoses.get(characterId) || [];
    const pose=companionHomeMotion(signature,Math.random,history);
    recentHomePoses.set(characterId,[...history,pose].slice(-3));
    homePose.current=pose; rest.current=pose;
    setState({ owner:characterId,motion:pose,sequence:0 });
  }, [enabled,characterId,signature]);
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange",onVisibility);
    return () => document.removeEventListener("visibilitychange",onVisibility);
  }, [enabled]);
  // Schedule immediately after DOM commit so fast taps or a simulated clock cannot miss the return timer.
  useLayoutEffect(() => {
    if (!enabled || !visible || state.owner !== characterId || state.motion === rest.current) return;
    const timer = window.setTimeout(() => setState(value => value.owner === state.owner && value.sequence === state.sequence
      ? { ...value,motion:rest.current } : value),
      companionMotionAnimation(state.motion,signature).duration * 1000);
    return () => window.clearTimeout(timer);
  }, [enabled,visible,characterId,signature,state.motion,state.owner,state.sequence]);
  function react() {
    if (!enabled || !characterId) return;
    let motion = companionInteractionMotion(signature,++interactions.current,rest.current === "rest");
    // A greeting pose may equal a touch gesture; always provide a visible response.
    if (motion === rest.current) motion = companionInteractionMotion(signature,++interactions.current,false);
    setState(value => ({ owner:characterId,motion,sequence:value.sequence+1 }));
  }
  function activity(action: CompanionAction) {
    if (!enabled || !characterId) return;
    rest.current=action === "rest" ? "rest" : homePose.current;
    setState(value => ({ owner:characterId,motion:companionMotionForAction(action),sequence:value.sequence+1 }));
  }
  return { motion:state.owner === characterId ? state.motion : "idle" as CompanionMotion,
    sequence:state.owner === characterId ? state.sequence : 0,paused:!visible,
    resting:rest.current === "rest",react,activity };
}
