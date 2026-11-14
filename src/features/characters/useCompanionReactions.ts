import { useEffect, useRef } from "react";
import { lastChatReaction, markChatReaction, recordChatReaction, releaseChatModel } from "./companionChatService";
import { createTouchReactionQueue, recentTouchLines, rememberTouchLine, type TouchContext } from "./companionTouch";
import type { CompanionGeneration } from "./companionLlm";
import {companionExecutionError} from "./companionLlm";
import {generateOwnReaction, warmOwnAi} from "./ownAi/client";

// Publish the real inference outcome, not a substitute line. Home decides whether
// to show AI speech or a separate non-character error/status message.
export function useCompanionReactions(characterId: string | undefined, onResult: (result: CompanionGeneration) => void) {
  const callback = useRef(onResult); callback.current = onResult;
  const sessionId = useRef(crypto.randomUUID());
  const usedSession = useRef(false);
  const queue = useRef<ReturnType<typeof createTouchReactionQueue> | undefined>(undefined);
  useEffect(() => {
    void warmOwnAi().catch(() => {});
    sessionId.current = crypto.randomUUID();
    const visibility = () => { if (document.hidden) { if (usedSession.current) void releaseChatModel(sessionId.current); usedSession.current = false; sessionId.current = crypto.randomUUID(); } };
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); if (usedSession.current) void releaseChatModel(sessionId.current); usedSession.current = false; };
  }, []);
  useEffect(() => {
    const current = createTouchReactionQueue(async (context, signal) => {
      try {
        if (signal.aborted || document.hidden) throw new Error("AI_CANCELLED");
        markChatReaction(context.owned.id, "running");
        const line = await generateOwnReaction({characterId:context.definition.id, action:context.action,
          affection:context.owned.affection,mood:context.memory.mood,energy:context.memory.energy,
          sleeping:Boolean(context.sleeping),previous:context.previous},signal);
        return {source:"on-device",line} as CompanionGeneration;
      } catch (cause) {
        return {source:"local-rules",line:"",failure:"execution",message:companionExecutionError(cause)} as CompanionGeneration;
      }
    }, (reply, context) => {
      if (document.hidden) return;
      recordChatReaction(context.owned.id, reply);
      if (reply.source === "on-device") rememberTouchLine(context.owned.id, reply.line);
      callback.current(reply);
    }, () => {}, 20);
    queue.current = current;
    const cancel = () => {
      current.cancel();
      if (characterId && ["queued", "running"].includes(lastChatReaction(characterId)?.phase || "")) markChatReaction(characterId, "cancelled");
    };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancel(); current.dispose(); queue.current = undefined; document.removeEventListener("visibilitychange", visibility); };
  }, [characterId]);
  return {
    waitForContext: () => queue.current?.hold(),
    react: (context: Omit<TouchContext, "previous" | "hour">) => { usedSession.current = true; markChatReaction(context.owned.id, "queued"); queue.current?.enqueue({ ...context, previous: recentTouchLines(context.owned.id), hour: new Date().getHours() }); },
    cancel: () => queue.current?.cancel(),
    stopAndRelease: () => {
      queue.current?.cancel();
      if (usedSession.current) {
        void releaseChatModel(sessionId.current);
        usedSession.current = false;
        sessionId.current = crypto.randomUUID();
      }
    },
  };
}
