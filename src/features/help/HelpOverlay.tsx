import { useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useHelpCharacter } from '../characters/CharacterHelp';
import { CharacterVisual } from '../characters/CharacterVisual';
import { resolveHelpDialogue } from './helpDialogue';
import { isHelpTarget, type HelpStep } from './helpContent';
import { placeGuide, type Rect, type Viewport } from './helpGeometry';

type Session = { steps: HelpStep[]; root: HTMLElement; opener: HTMLElement | null; scope: string };
const viewportRect = (): Viewport => ({ x: window.visualViewport?.offsetLeft ?? 0, y: window.visualViewport?.offsetTop ?? 0, width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });
function keepTargetInView(element: HTMLElement, scope: string) {
  const viewport = viewportRect();
  const header = scope === 'screen' ? document.querySelector<HTMLElement>('.sidebar') : null;
  const headerStyle = header && getComputedStyle(header);
  const top = header && (headerStyle?.position === 'sticky' || headerStyle?.position === 'fixed')
    ? Math.max(viewport.y, Math.min(header.getBoundingClientRect().bottom, viewport.y + viewport.height * .45)) : viewport.y;
  const bounds = element.getBoundingClientRect();
  if (bounds.top < top + 8 || bounds.bottom > viewport.y + viewport.height - 8 || bounds.left < viewport.x || bounds.right > viewport.x + viewport.width)
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  return element.getBoundingClientRect();
}

export function HelpOverlay({ session, onClose }: { session: Session; onClose: () => void }) {
  const character = useHelpCharacter();
  const [steps, setSteps] = useState(session.steps);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [viewport, setViewport] = useState(viewportRect);
  const [cardSize, setCardSize] = useState({ width: 340, height: 260 });
  const layer = useRef<HTMLDivElement>(null), card = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const empty = session.steps.length === 0;
  const step = steps[Math.min(index, steps.length - 1)] ?? { id: 'empty', target: session.root, title: '현재 안내할 작업이 없어요', instruction: '지금 화면에는 사용할 수 있는 작업이 없어요. 항목을 추가하거나 다른 화면을 연 뒤 다시 도움말을 눌러 주세요.' };
  const mask = useId().replace(/:/g, '');
  const copy = resolveHelpDialogue(character.definition, character.affection, step?.instruction ?? '');
  const move = useCallback((direction: number) => {
    const next = index + direction;
    if (next >= steps.length) closeRef.current();
    else setIndex(Math.max(0, next));
  }, [index, steps.length]);

  useLayoutEffect(() => {
    const host = layer.current;
    if (!host) return;
    const oldOverflow = document.body.style.overflow;
    const scroll = { x: window.scrollX, y: window.scrollY };
    const scrollContainers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(e => !host.contains(e) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth))
      .map(e => ({ e, top: e.scrollTop, left: e.scrollLeft }));
    const inert: { e: HTMLElement; previous: boolean }[] = [];
    // Fullscreen portals need every sibling along their path isolated too.
    let current: HTMLElement = host;
    while (current.parentElement) {
      for (const e of Array.from(current.parentElement.children)) if (e instanceof HTMLElement && e !== current && !inert.some(i => i.e === e)) { inert.push({ e, previous: e.inert }); e.inert = true; }
      if (current.parentElement === document.body) break;
      current = current.parentElement;
    }
    document.body.style.overflow = 'hidden';
    card.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); return; }
      if (event.key === 'Tab') {
        const buttons = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || !host?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !host?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        event.stopImmediatePropagation();
      } else {
        // Parent photo/album dialogs also listen on window. Their arrow-key
        // shortcuts must never move the underlying record during a help step.
        event.stopImmediatePropagation();
        const reading = (event.target as HTMLElement | null)?.closest('.helpGuideContent') && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key);
        if (!reading && !['Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) event.preventDefault();
      }
    }
    window.addEventListener('keydown', keyboard, true);
    return () => {
      window.removeEventListener('keydown', keyboard, true);
      inert.forEach(({ e, previous }) => { e.inert = previous; });
      document.body.style.overflow = oldOverflow;
      scrollContainers.forEach(({ e, top, left }) => { if (e.isConnected) { e.scrollTop = top; e.scrollLeft = left; } });
      window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
      requestAnimationFrame(() => { if (session.opener?.isConnected) session.opener.focus({ preventScroll: true }); });
    };
  }, [session]);

  useLayoutEffect(() => {
    if (empty) return;
    const element = step.target;
    element.dataset.helpHighlighted = step.id;
    element.dataset.helpScope = session.scope;
    keepTargetInView(element, session.scope);
    let frame = 0;
    function measure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const valid = steps.filter(item => isHelpTarget(item.target));
        if (!valid.length) { closeRef.current(); return; }
        if (valid.length !== steps.length) { const position = Math.max(0, valid.findIndex(item => item.target === element)); setSteps(valid); setIndex(Math.min(position, valid.length - 1)); return; }
        const rect = keepTargetInView(element, session.scope);
        setTarget({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }); setViewport(viewportRect());
        if (card.current) {
          const panel = card.current, content = panel.querySelector<HTMLElement>('.helpGuideContent');
          const style = getComputedStyle(panel);
          // A constrained flex box's scrollHeight feeds back its clipped height.
          // Measure the intrinsic children to retain the speech and character.
          const height = (panel.querySelector('header')?.getBoundingClientRect().height ?? 44)
            + (panel.querySelector('footer')?.getBoundingClientRect().height ?? 52)
            + (content?.scrollHeight ?? 170) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
          setCardSize({ width: Math.min(340, viewportRect().width - 20), height });
        }
      });
    }
    measure();
    const resize = new ResizeObserver(measure); resize.observe(element); if (card.current) resize.observe(card.current);
    const mutations = new MutationObserver(measure); mutations.observe(session.root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-disabled'] });
    window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); delete element.dataset.helpHighlighted; delete element.dataset.helpScope; };
  }, [step, steps, session, onClose, empty]);

  const placement = empty ? { x: viewport.x + Math.max(10, (viewport.width - 340) / 2), y: viewport.y + Math.max(10, (viewport.height - 280) / 2), width: Math.min(340, viewport.width - 20), height: Math.min(280, viewport.height - 20), side: 'below' } : placeGuide(target, cardSize, viewport);
  const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const anchor = { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };
  return createPortal(<div ref={layer} data-help-ui="overlay" className="helpOverlay" role="dialog" aria-modal="true" aria-labelledby="helpDialogTitle" aria-describedby="helpInstruction"
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <h2 id="helpDialogTitle" className="helpSrOnly">버튼 도움말</h2>
    {!empty ? <svg className="helpMask" width="100%" height="100%" aria-hidden="true">
      <defs><mask id={mask}><rect width="100%" height="100%" fill="white" /><rect x={target.x - 6} y={target.y - 6} width={target.width + 12} height={target.height + 12} rx="10" fill="black" /></mask></defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,.82)" mask={`url(#${mask})`} />
      <rect className="helpSpotlight" x={target.x - 6} y={target.y - 6} width={target.width + 12} height={target.height + 12} rx="10" />
      <line x1={anchor.x} y1={anchor.y} x2={point.x} y2={point.y} stroke="var(--primary, #7d835a)" strokeWidth="2" strokeDasharray="4 5" />
    </svg> : <div className="helpEmptyDim" aria-hidden="true" />}
    <section ref={card} className="helpGuideCard" data-placement={placement.side} style={{ left: placement.x, top: placement.y, width: placement.width, maxHeight: placement.height } as CSSProperties}>
      <header><span aria-hidden="true">{empty ? '0 / 0' : `${index + 1} / ${steps.length}`}</span><span className="helpSrOnly" role="status" aria-live="polite" aria-atomic="true">{index + 1} / {steps.length}. {step.title}. {copy.line} {copy.instruction}</span><button type="button" aria-label="도움말 종료" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
      <div className="helpGuideContent" tabIndex={0} role="region" aria-label="캐릭터 설명" key={step.id}>
        <div className="helpCharacter" aria-hidden="true" data-facing={point.x < anchor.x ? 'left' : 'right'}><CharacterVisual definition={character.definition} stage={character.stage} affection={character.affection} expression={copy.tier >= 3 ? 'happy' : 'idle'} gomiMotion={copy.tier >= 4 ? 'paw-wave' : copy.tier >= 3 ? 'happy' : 'cynical'} reactionKey={index} /></div>
        <div className="helpSpeech"><strong className="characterHelpName">{character.name}</strong><h3>{step.title}</h3><p className="helpVoice" data-affinity={copy.tier}>{copy.line}</p><p id="helpInstruction">{copy.instruction}</p></div>
      </div>
      <footer><button type="button" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={16} aria-hidden="true" />이전</button>{!empty && <button type="button" className="helpSkip" onClick={() => move(1)}>건너뛰기</button>}<button type="button" className="primary" onClick={() => empty || index === steps.length - 1 ? onClose() : move(1)}>{empty || index === steps.length - 1 ? '마치기' : '다음'}<ChevronRight size={16} aria-hidden="true" /></button></footer>
    </section>
  </div>, document.fullscreenElement ?? document.body);
}
