import { useEffect } from "react";
import { isAndroidRuntime } from "../services/tauriMediaService";

declare global { interface Window { __gamjassakBack?: () => boolean } }

export function useAndroidBack(atHome: boolean, importing: boolean, goHome: () => void) {
  useEffect(() => {
    if (!isAndroidRuntime()) return;
    window.__gamjassakBack = () => {
      if (importing) return true;
      if (document.querySelector('[role="dialog"]')) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", cancelable:true, bubbles:true }));
        return true;
      }
      if (!atHome) { goHome(); return true; }
      return false;
    };
    return () => { delete window.__gamjassakBack; };
  }, [atHome, importing, goHome]);
}
