import { useEffect, useRef } from 'react';

/** A screen's temporary mode closes before Android Back leaves that screen. */
export function useBackAction(enabled: boolean, onBack: () => void) {
  const callback = useRef(onBack);
  callback.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    function back(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
      // Dialogs and anchored menus own Back until their top layer closes.
      if (document.querySelector('[role="dialog"], .actionMenuPanel')) return;
      event.preventDefault();
      callback.current();
    }
    window.addEventListener('keydown', back);
    return () => window.removeEventListener('keydown', back);
  }, [enabled]);
}
