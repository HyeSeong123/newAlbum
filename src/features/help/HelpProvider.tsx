import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { collectHelpSteps, currentHelpRoot, type HelpContext, type HelpStep } from './helpContent';
import { HelpOverlay } from './HelpOverlay';
import './help.css';

type Session = { steps: HelpStep[]; root: HTMLElement; opener: HTMLElement | null; scope: string; variation: number };
const HelpContextValue = createContext<{ start: () => void; active: boolean }>({ start() {}, active: false });
export const useInteractiveHelp = () => useContext(HelpContextValue);

/** Screen identity comes from App state; DOM supplies the live controls of that screen. */
export function HelpProvider({ context, children, request = 0, onActiveChange }: { context: HelpContext; children: ReactNode; request?: number; onActiveChange?: (active: boolean) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [available, setAvailable] = useState(false);
  const [bottom, setBottom] = useState(16);
  const [right, setRight] = useState(16);
  const [owner, setOwner] = useState<HTMLElement | null>(null);
  const [fullscreenRoot, setFullscreenRoot] = useState(() => document.fullscreenElement);
  const triggerId = useId();
  const contextRef = useRef(context); contextRef.current = context;
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogueVisit = useRef(0);
  const start = useCallback(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    // A first-run/menu handler may close its own layer in this same event.
    requestAnimationFrame(() => {
      if (contextRef.current.blocked) return;
      const root = currentHelpRoot();
      if (!root) return;
      const steps = collectHelpSteps(root, contextRef.current);
      setSession({ steps, root, opener, variation:dialogueVisit.current++, scope: root.matches('[role="dialog"], [role="menu"], .actionMenuPanel') ? 'dialog' : 'screen' });
    });
  }, []);
  const close = useCallback(() => setSession(null), []);
  useEffect(() => { if (request) start(); }, [request, start]);
  useEffect(() => { onActiveChange?.(Boolean(session)); }, [session, onActiveChange]);
  const identity = `${context.screen}:${context.tab}`;
  useEffect(() => { setSession(null); }, [identity, context.blocked]);
  useEffect(() => {
    const syncFullscreen = () => setFullscreenRoot(document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  useEffect(() => {
    if (!owner) return;
    const previous = owner.getAttribute('aria-owns');
    owner.setAttribute('aria-owns', `${previous ?? ''} ${triggerId}`.trim());
    return () => { if (previous === null) owner.removeAttribute('aria-owns'); else owner.setAttribute('aria-owns', previous); };
  }, [owner, triggerId]);

  // A floating portal is owned by the active dialog for assistive technology,
  // and must also participate in its actual keyboard order. Existing dialog
  // traps only know their descendants, so cycle this combined set at capture.
  useEffect(() => {
    if (!owner || session) return;
    function keyboard(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !owner?.isConnected || !trigger.current
        || !(owner.contains(document.activeElement) || document.activeElement === trigger.current)) return;
      const controls = Array.from(owner.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]'))
        .filter(e => e.tabIndex >= 0 && !e.matches(':disabled') && !e.closest('[inert], [hidden]') && e.getClientRects().length && getComputedStyle(e).visibility === 'visible');
      controls.push(trigger.current);
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault(); event.stopImmediatePropagation();
      controls[next]?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', keyboard, true);
    return () => window.removeEventListener('keydown', keyboard, true);
  }, [owner, session]);

  useEffect(() => {
    if (session) return;
    let frame = 0;
    function measure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = currentHelpRoot();
        setOwner(root?.matches('[role="dialog"]') ? root : null);
        setAvailable(Boolean(root) && !contextRef.current.blocked);
        const viewport = window.visualViewport;
        const height = viewport?.height ?? window.innerHeight;
        const width = viewport?.width ?? window.innerWidth;
        const offset = viewport?.offsetTop ?? 0;
        const dialog = root?.matches('[role="dialog"]');
        const menu = root?.matches('[role="menu"], .actionMenuPanel');
        // Reserve only genuinely pinned actions. Ordinary cards and inputs
        // scroll underneath the fixed corner; chasing them makes ? jump.
        // Mobile dialog action rows reserve their own right-hand help slot.
        // Keep the desktop dock handling where that CSS slot is not present.
        const dialogHasSlot = dialog && window.matchMedia('(max-width: 999px)').matches;
        const docks = dialogHasSlot ? [] : menu ? [root!] : Array.from((dialog ? root! : document).querySelectorAll<HTMLElement>(dialog ? '[data-help-dock], footer' : '[data-help-dock]'));
        const obstacles = docks.flatMap(element => {
          const style = getComputedStyle(element);
          if (!element.getClientRects().length || element.closest('[hidden], [inert]') || style.visibility === 'hidden') return [];
          const pinned = style.position === 'fixed' || style.position === 'sticky';
          if (!pinned && !(dialog && element.tagName === 'FOOTER' && style.flexShrink === '0')) return [];
          const rect = element.getBoundingClientRect();
          // Expanded panels may sit outside their fixed wrapper's own box.
          const dockTop = Math.min(rect.top, ...Array.from(element.querySelectorAll<HTMLElement>('[data-help-dock]'))
            .filter(child => child.getClientRects().length && getComputedStyle(child).visibility !== 'hidden')
            .map(child => child.getBoundingClientRect().top));
          const occupiedHeight = rect.bottom - dockTop;
          // A sticky dock reserves its bottom slot even before it sticks.
          const top = pinned && style.bottom !== 'auto'
            ? offset + height - parseFloat(style.bottom) - occupiedHeight : dockTop;
          return [{ left: rect.left, right: rect.right, top, bottom: top + occupiedHeight }];
        }).sort((a, b) => b.bottom - a.bottom);
        let inset = 16;
        for (const obstacle of obstacles) {
          const x = width - 64, y = offset + height - inset - 48;
          if (obstacle.right > x - 8 && obstacle.left < x + 56 && obstacle.bottom > y - 8 && obstacle.top < y + 56)
            inset = Math.max(inset, offset + height - obstacle.top + 12);
        }
        setBottom(Math.max(16, window.innerHeight - offset - height + Math.min(inset, Math.max(16, height - 64))));
        setRight(Math.max(16, document.documentElement.clientWidth - (viewport?.offsetLeft ?? 0) - width + 16));
      });
    }
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-disabled', 'aria-expanded'] });
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); };
  }, [session, identity, context.selection, context.selectedCount, context.blocked]);

  return <HelpContextValue.Provider value={{ start, active: Boolean(session) }}>
    {children}
    {createPortal(<div data-help-ui="trigger" className="helpTriggerHost" style={{ bottom: `max(${bottom}px, env(safe-area-inset-bottom))`, right: `max(${right}px, env(safe-area-inset-right))` }}>
      {available && <button ref={trigger} id={triggerId} hidden={Boolean(session)} type="button" className="helpTrigger" aria-label="현재 화면 도움말" aria-haspopup="dialog" onPointerDown={event => event.stopPropagation()} onClick={start}><CircleHelp size={24} aria-hidden="true" /></button>}
    </div>, fullscreenRoot ?? document.body)}
    {session && <HelpOverlay session={session} onClose={close} />}
  </HelpContextValue.Provider>;
}
