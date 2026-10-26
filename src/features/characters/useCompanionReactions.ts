import { useEffect, useRef } from "react";
import { chatModelStatus, generateChatReply, lastChatReaction, markChatReaction, recordChatReaction, releaseChatModel, stopChatModel } from "./companionChatService";
import { createTouchReactionQueue, generateTouchLine, recentTouchLines, rememberTouchLine, type TouchContext } from "./companionTouch";

export function useCompanionReactions(characterId: string | undefined, onLine: (line: string) => void) {
  const callback = useRef(onLine); callback.current = onLine;
  const sessionId = useRef(crypto.randomUUID());
  const usedSession = useRef(false);
  const queue = useRef<ReturnType<typeof createTouchReactionQueue> | undefined>(undefined);
  useEffect(() => {
    sessionId.current = crypto.randomUUID();
    const visibility = () => { if (document.hidden) { if (usedSession.current) void releaseChatModel(sessionId.current); usedSession.current = false; sessionId.current = crypto.randomUUID(); } };
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); if (usedSession.current) void releaseChatModel(sessionId.current); usedSession.current = false; };
  }, []);
  useEffect(() => {
    const current = createTouchReactionQueue(async (context, signal) => {
      return generateTouchLine(context, async (prompt) => {
        const status = await chatModelStatus();
        if (signal.aborted || document.hidden) throw new Error("AI_CANCELLED");
        if (!status.supported || !status.installed) throw new Error(status.message);
        if (status.phase !== "ready" && status.phase !== "error") throw new Error("진행 중인 작업이 끝난 뒤 다시 시도해 주세요.");
        markChatReaction(context.owned.id, "running");
        const id = sessionId.current;
        const stop = () => { void stopChatModel(id).catch(() => {}); };
        signal.addEventListener("abort", stop, { once: true });
        try { return await generateChatReply(prompt, id); }
        finally { signal.removeEventListener("abort", stop); }
      }, signal);
    }, (reply, context) => {
      if (document.hidden) return;
      recordChatReaction(context.owned.id, reply);
      if (reply.source !== "on-device") return;
      rememberTouchLine(context.owned.id, reply.line);
      callback.current(reply.line);
    }, () => {});
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
  };
}
