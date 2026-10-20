import { useEffect } from "react";
import { isAndroidRuntime } from "../services/tauriMediaService";

declare global { interface Window { __gamjassakBack?: () => boolean } }

export function useAndroidBack(atHome: boolean, importing: boolean, goHome: () => void) {
  useEffect(() => {
    if (!isAndroidRuntime()) return;
    window.__gamjassakBack = () => {
      if (importing) return true;
      // Start at the focused control so portalled menus handle Back before
      // the current screen or a parent dialog.
      const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
      (document.activeElement ?? window).dispatchEvent(escape);
      if (escape.defaultPrevented || document.querySelector('[role="dialog"]')) return true;
      if (!atHome) { goHome(); return true; }
      return false;
    };
    return () => { delete window.__gamjassakBack; };
  }, [atHome, importing, goHome]);
}
