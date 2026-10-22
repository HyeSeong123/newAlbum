import { useRef, type PointerEvent } from 'react';

// Across rows, include every tile in the row band, not only pointer-hit tiles.
export function useRowSelection(enabled: boolean, toggle: (id: string) => void, isSelected: (id: string) => boolean) {
  const gesture = useRef<{ start: string; seen: Set<string>; pointer: number; select: boolean; x: number; y: number; dragging: boolean } | null>(null);
  const suppressMouseClick = useRef(false);
  function visit(element: HTMLElement) {
    const id = element.dataset.selectionId!;
    if (!gesture.current || gesture.current.seen.has(id) || element.matches(':disabled') || element.querySelector('button:disabled')) return;
    gesture.current.seen.add(id);
    if (isSelected(id) !== gesture.current.select) toggle(id);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!enabled || !current || current.pointer !== event.pointerId) return;
    if (!current.dragging) {
      const dx = Math.abs(event.clientX-current.x), dy = Math.abs(event.clientY-current.y);
      if (dy > 10 && dy > dx) { gesture.current=null; return; }
      if (dx < 12 || dx < dy) return;
      current.dragging=true; suppressMouseClick.current=true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const tiles = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-selection-id]')];
    const start = tiles.find((tile) => tile.dataset.selectionId === current.start);
    if (!start) return;
    const boxes = tiles.map((tile) => ({ tile, rect: tile.getBoundingClientRect() }));
    const hit = boxes.reduce((best, entry) => {
      const distance = Math.max(entry.rect.top - event.clientY, 0, event.clientY - entry.rect.bottom) * 10000
        + Math.max(entry.rect.left - event.clientX, 0, event.clientX - entry.rect.right);
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
  function end(event: PointerEvent<HTMLDivElement>) {
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    style: enabled ? { touchAction: 'pan-y pinch-zoom' as const, userSelect: 'none' as const } : undefined,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      suppressMouseClick.current = false;
      // Horizontal brush selects on touch; vertical swipes remain native scrolling.
      if (!enabled || event.button !== 0) return;
      const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-id]');
      if (!tile) return;
      const mouse=event.pointerType==='mouse';
      suppressMouseClick.current=mouse;
      gesture.current = { start: tile.dataset.selectionId!, seen: new Set(), pointer: event.pointerId, select: !isSelected(tile.dataset.selectionId!), x:event.clientX, y:event.clientY, dragging:mouse };
      if(mouse) {event.currentTarget.setPointerCapture(event.pointerId);visit(tile);}
    },
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      // Touch transfers implicit capture from the starting tile to this grid.
      // The child's bubbling loss must not end the grid's active brush.
      if (event.target === event.currentTarget && gesture.current?.pointer === event.pointerId) gesture.current = null;
    },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (enabled && suppressMouseClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      suppressMouseClick.current = false;
    },
  };
}
