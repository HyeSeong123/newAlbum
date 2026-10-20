import { useEffect, type KeyboardEvent, type RefObject } from 'react';

/** Focus stays in an open dialog and returns to the control that opened it. */
export function useDialogFocus<T extends HTMLElement>(root: RefObject<T | null>, enabled = true, initialSelector?: string) {
  useEffect(() => {
    if (!enabled) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = initialSelector ? root.current?.querySelector<HTMLElement>(initialSelector) : null;
    (initial ?? root.current)?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [root, enabled, initialSelector]);

  return (event: KeyboardEvent<T>) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const panel = root.current;
    if (!panel || !panel.contains(event.target as Node)) return;
    const controls = [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); panel.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
  };
}
