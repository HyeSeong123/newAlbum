import type { Rect, Viewport } from './helpGeometry';

const clips = (overflow: string) => /^(auto|scroll|hidden|clip|overlay)$/.test(overflow);

/** A control can be inside the window but clipped by a dialog's scroll body. */
export function helpTargetViewport(element: HTMLElement, viewport: Viewport, headerBottom = viewport.y): Viewport {
  let left = viewport.x, right = viewport.x + viewport.width;
  let top = Math.max(viewport.y, headerBottom), bottom = viewport.y + viewport.height;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    // Body overflow is locked by the help layer, not a content scroll port.
    if (parent.tagName === 'BODY' || parent.tagName === 'HTML') continue;
    const style = getComputedStyle(parent);
    const clipX = clips(style.overflowX), clipY = clips(style.overflowY);
    if (!clipX && !clipY) continue;
    const bounds = parent.getBoundingClientRect();
    const x = bounds.left + parent.clientLeft, y = bounds.top + parent.clientTop;
    if (clipX) { left = Math.max(left, x); right = Math.min(right, x + parent.clientWidth); }
    if (clipY) { top = Math.max(top, y); bottom = Math.min(bottom, y + parent.clientHeight); }
  }
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function keepHelpTargetInView(element: HTMLElement, viewport: Viewport, headerBottom = viewport.y) {
  const area = helpTargetViewport(element, viewport, headerBottom);
  const bounds = element.getBoundingClientRect();
  const outside = (start: number, size: number, edge: number, space: number) => {
    const margin = Math.min(8, space / 4);
    return size <= space - margin * 2
      ? start < edge + margin || start + size > edge + space - margin
      : start + size <= edge + margin || start >= edge + space - margin;
  };
  if (!area.width || !area.height || outside(bounds.left, bounds.width, area.x, area.width)
    || outside(bounds.top, bounds.height, area.y, area.height))
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
}

/** Only brighten the part the user can actually see, never a covered footer. */
export function visibleHelpTargetRect(element: HTMLElement, viewport: Viewport, headerBottom = viewport.y): Rect {
  const area = helpTargetViewport(element, viewport, headerBottom), bounds = element.getBoundingClientRect();
  const x = Math.max(bounds.left, area.x), y = Math.max(bounds.top, area.y);
  return { x, y, width: Math.max(0, Math.min(bounds.right, area.x + area.width) - x),
    height: Math.max(0, Math.min(bounds.bottom, area.y + area.height) - y) };
}

/** SVG and speech card share the same fixed layer, including fullscreen. */
export function helpLayerRect(rect: Rect, origin: { x: number; y: number }): Rect {
  return { ...rect, x: rect.x - origin.x, y: rect.y - origin.y };
}
