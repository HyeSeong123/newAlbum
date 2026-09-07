import { useRef, type PointerEvent } from 'react';

// Across rows, include every tile in the row band, not only pointer-hit tiles.
export function useRowSelection(enabled: boolean, toggle: (id: string) => void, isSelected: (id: string) => boolean) {
  const gesture = useRef<{ start: string; seen: Set<string>; pointer: number; select: boolean } | null>(null);
  function visit(element: HTMLElement) {
    const id = element.dataset.selectionId!;
    if (!gesture.current || gesture.current.seen.has(id)) return;
    gesture.current.seen.add(id);
    if (isSelected(id) !== gesture.current.select) toggle(id);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!enabled || !current || current.pointer !== event.pointerId) return;
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
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || event.button !== 0) return;
      const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-id]');
      if (!tile) return;
      gesture.current = { start: tile.dataset.selectionId!, seen: new Set(), pointer: event.pointerId, select: !isSelected(tile.dataset.selectionId!) };
      event.currentTarget.setPointerCapture(event.pointerId);
      visit(tile);
    },
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture() { gesture.current = null; },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (enabled && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    },
  };
}
