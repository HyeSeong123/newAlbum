import { useEffect, useRef, useState } from "react";
import { chatModelStatus, generateChatReply, stopChatModel } from "./companionChatService";
import { createTouchReactionQueue, generateTouchLine, recentTouchLines, rememberTouchLine, type TouchContext } from "./companionTouch";

export function useCompanionReactions(characterId: string | undefined, onLine: (line: string) => void) {
  const [thinking, setThinking] = useState(false);
  const callback = useRef(onLine); callback.current = onLine;
  const queue = useRef<ReturnType<typeof createTouchReactionQueue> | undefined>(undefined);
  useEffect(() => {
    const current = createTouchReactionQueue(async (context, signal) => {
      return generateTouchLine(context, async (prompt) => {
        const status = await chatModelStatus();
        if (signal.aborted || !status.supported || !status.installed || status.phase !== "ready" || document.hidden || document.querySelector('[role="dialog"]')) throw new Error("AI reaction unavailable");
        const stop = () => { void stopChatModel().catch(() => {}); };
        signal.addEventListener("abort", stop, { once: true });
        try { return await generateChatReply(prompt); }
        finally { signal.removeEventListener("abort", stop); }
      }, signal);
    }, (reply, context) => {
      if (reply.source !== "on-device" || document.hidden || document.querySelector('[role="dialog"]')) return;
      rememberTouchLine(context.owned.id, reply.line);
      callback.current(reply.line);
    }, setThinking);
    queue.current = current;
    const visibility = () => { if (document.hidden) current.cancel(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { current.dispose(); queue.current = undefined; document.removeEventListener("visibilitychange", visibility); };
  }, [characterId]);
  return { thinking,
    react: (context: Omit<TouchContext, "previous" | "hour">) => queue.current?.enqueue({ ...context, previous: recentTouchLines(context.owned.id), hour: new Date().getHours() }),
    cancel: () => queue.current?.cancel(),
  };
}
