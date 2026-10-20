import { useCallback, useRef, type PointerEvent } from 'react';

// Across rows, include every tile in the row band, not only pointer-hit tiles.
export function useRowSelection(enabled: boolean, toggle: (id: string) => void, isSelected: (id: string) => boolean) {
  const gesture = useRef<{ start: string; seen: Set<string>; pointer: number; select: boolean } | null>(null);
  const suppressClick = useRef(false);
  const callbacks = useRef({ toggle, isSelected });
  callbacks.current = { toggle, isSelected };
  function visit(element: HTMLElement) {
    const id = element.dataset.selectionId!;
    if (!gesture.current || gesture.current.seen.has(id) || element.matches(':disabled')) return;
    gesture.current.seen.add(id);
    if (callbacks.current.isSelected(id) !== gesture.current.select) callbacks.current.toggle(id);
  }
  function begin(tile: HTMLElement, pointer: number) {
    suppressClick.current = true;
    gesture.current = { start: tile.dataset.selectionId!, seen: new Set(), pointer, select: !callbacks.current.isSelected(tile.dataset.selectionId!) };
    visit(tile);
  }
  function move(root: HTMLDivElement, x: number, y: number) {
    const current = gesture.current;
    if (!current) return;
    const tiles = [...root.querySelectorAll<HTMLElement>('[data-selection-id]')];
    const start = tiles.find((tile) => tile.dataset.selectionId === current.start);
    if (!start) return;
    const boxes = tiles.map((tile) => ({ tile, rect: tile.getBoundingClientRect() }));
    const hit = boxes.reduce((best, entry) => {
      const distance = Math.max(entry.rect.top - y, 0, y - entry.rect.bottom) * 10000
        + Math.max(entry.rect.left - x, 0, x - entry.rect.right);
      return distance < best.distance ? { entry, distance } : best;
    }, { entry: boxes[0], distance: Infinity }).entry;
    if (!hit) return;
    const startTop = start.getBoundingClientRect().top;
    if (Math.abs(startTop - hit.rect.top) > 4) {
      const low = Math.min(startTop, hit.rect.top) - 4;
      const high = Math.max(startTop, hit.rect.top) + 4;
      boxes.filter(({ rect }) => rect.top >= low && rect.top <= high).forEach(({ tile }) => visit(tile));
    } else {
      const first = tiles.indexOf(start), last = tiles.indexOf(hit.tile);
      tiles.slice(Math.min(first, last), Math.max(first, last) + 1).forEach(visit);
    }
  }
  // React's delegated touch listeners are passive. A local non-passive listener
  // blocks scrolling only after a stationary long press; quick swipes keep
  // native scrolling and multi-touch keeps pinch zoom.
  const ref = useCallback((root: HTMLDivElement | null) => {
    if (!root || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: { id: number; x: number; y: number; tile: HTMLElement } | undefined;
    const reset = () => { clearTimeout(timer); pending = undefined; gesture.current = null; };
    const start = (event: TouchEvent) => {
      reset(); suppressClick.current = false;
      if (event.touches.length !== 1) return;
      const tile = (event.target as Element).closest<HTMLElement>('[data-selection-id]');
      if (!tile || tile.matches(':disabled')) return;
      const touch = event.touches[0];
      pending = { id: touch.identifier, x: touch.clientX, y: touch.clientY, tile };
      timer = setTimeout(() => { if (pending?.tile.isConnected) begin(pending.tile, -1); }, 450);
    };
    const touchMove = (event: TouchEvent) => {
      if (!pending) return;
      if (event.touches.length !== 1) { reset(); return; }
      const touch = [...event.touches].find(item => item.identifier === pending!.id);
      if (!touch) { reset(); return; }
      if (gesture.current) {
        if (event.cancelable) event.preventDefault();
        move(root, touch.clientX, touch.clientY);
      } else if (Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y) > 8) reset();
    };
    const end = (event: TouchEvent) => {
      if (gesture.current && event.cancelable) event.preventDefault();
      reset();
    };
    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', touchMove, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', reset);
    return () => {
      reset();
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', touchMove);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);
  function end(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    ref,
    style: enabled ? { touchAction: 'pan-y pinch-zoom' as const, userSelect: 'none' as const } : undefined,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || event.pointerType !== 'mouse' || event.button !== 0) return;
      suppressClick.current = false;
      const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-id]');
      if (!tile || tile.matches(':disabled')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      begin(tile, event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (enabled && event.pointerType === 'mouse' && gesture.current?.pointer === event.pointerId) move(event.currentTarget, event.clientX, event.clientY);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) { if (event.pointerType === 'mouse') gesture.current = null; },
    onContextMenu(event: React.MouseEvent<HTMLDivElement>) { if (enabled && gesture.current) event.preventDefault(); },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (enabled && suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      suppressClick.current = false;
    },
  };
}
