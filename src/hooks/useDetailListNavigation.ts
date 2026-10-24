import { useEffect, useRef } from 'react';
import { useBackAction } from './useBackAction';

/** Detail opens at its heading; returning restores the list control and scroll. */
export function useDetailListNavigation(activeKey: string | undefined, onClose: () => void, backEnabled = true) {
  const heading = useRef<HTMLHeadingElement>(null);
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const listScroll = useRef(0);
  const returningTo = useRef<string | undefined>(undefined);
  function close() { returningTo.current = activeKey; onClose(); }
  useBackAction(Boolean(activeKey) && backEnabled, close);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (activeKey) {
        heading.current?.focus({ preventScroll: true });
        heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      } else if (returningTo.current) {
        window.scrollTo({ top: listScroll.current, behavior: 'instant' });
        controls.current.get(returningTo.current)?.focus({ preventScroll: true });
        returningTo.current = undefined;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeKey]);
  return {
    heading, close,
    remember: () => { listScroll.current = window.scrollY; },
    bindControl: (key: string) => (control: HTMLButtonElement | null) => {
      if (control) controls.current.set(key, control); else controls.current.delete(key);
    },
  };
}
