export type Rect = { x: number; y: number; width: number; height: number };
export type Viewport = Rect;
export type GuidePlacement = Rect & { side: 'left' | 'right' | 'above' | 'below' };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

/** Only four non-overlapping regions are considered, never the target itself. */
export function placeGuide(target: Rect, size: { width: number; height: number }, viewport: Viewport): GuidePlacement {
  const margin = 10, gap = 16;
  const left = viewport.x + margin, top = viewport.y + margin;
  const right = viewport.x + viewport.width - margin, bottom = viewport.y + viewport.height - margin;
  const candidates: GuidePlacement[] = [
    { side: 'right', x: target.x + target.width + gap, y: top, width: right - target.x - target.width - gap, height: bottom - top },
    { side: 'left', x: left, y: top, width: target.x - gap - left, height: bottom - top },
    { side: 'below', x: left, y: target.y + target.height + gap, width: right - left, height: bottom - target.y - target.height - gap },
    { side: 'above', x: left, y: top, width: right - left, height: target.y - gap - top },
  ];
  const regions = candidates.map(r => {
    const x = clamp(r.x, left, right), y = clamp(r.y, top, bottom);
    return { ...r, x, y, width: Math.max(0, Math.min(right, r.x + r.width) - x), height: Math.max(0, Math.min(bottom, r.y + r.height) - y) };
  });
  const score = (r: GuidePlacement) => Math.min(r.width / size.width, 1) * Math.min(r.height / size.height, 1);
  // Prefer sides only when a readable speech bubble fits there.
  const eligible = regions.filter(r => r.width >= Math.min(180, size.width) && r.height >= 120);
  const region = (eligible.length ? eligible : regions).sort((a, b) => score(b) - score(a) || b.width * b.height - a.width * a.height)[0];
  const width = Math.max(0, Math.min(size.width, region.width));
  const height = Math.max(0, Math.min(size.height, region.height));
  return { side: region.side, width, height,
    x: clamp(target.x + target.width / 2 - width / 2, region.x, region.x + region.width - width),
    y: clamp(target.y + target.height / 2 - height / 2, region.y, region.y + region.height - height) };
}
