import type { FaceFeatures } from './types';
export type FaceRegion = [number, number, number, number];

const regions: FaceRegion[] = [[0, 0, .56, .56], [.44, 0, .56, .56], [0, .44, .56, .56], [.44, .44, .56, .56]];
function valid(face: FaceFeatures) {
  const [x, y, w, h] = face.box;
  return face.box.every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 &&
    x + w <= 1.000001 && y + h <= 1.000001 && face.descriptor.length === 128 && face.descriptor.every(Number.isFinite);
}
function mapFace(face: FaceFeatures, [x, y, w, h]: FaceRegion): FaceFeatures {
  return { ...face, box: [x + face.box[0] * w, y + face.box[1] * h, face.box[2] * w, face.box[3] * h] };
}
function overlap(a: FaceRegion, b: FaceRegion) {
  const intersection = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return intersection / Math.max(1e-12, a[2] * a[3] + b[2] * b[3] - intersection);
}
function originalFaceRegion([x, y, w, h]: FaceRegion): FaceRegion {
  const left = Math.max(0, x - w * .4), top = Math.max(0, y - h * .4);
  return [left, top, Math.min(1, x + w * 1.4) - left, Math.min(1, y + h * 1.4) - top];
}

// Only explicitly requested retries call this operation. Regions are processed
// serially to retain the existing one-photo/one-model mobile memory budget.
export async function analyzePreciseFaces(initial: FaceFeatures[], detectRegion: (region: FaceRegion) => Promise<FaceFeatures[]>) {
  const faces = initial.filter(valid).slice(0, 100).map(face => ({ ...face }));
  let passes = 0;
  for (const region of regions) {
    const found = await detectRegion([...region]);
    passes++;
    for (const local of found.filter(valid)) {
      const face = mapFace(local, region);
      if (valid(face) && faces.length < 100 && !faces.some(existing => overlap(existing.box, face.box) >= .45)) faces.push(face);
    }
  }
  for (const face of faces.filter(face => face.quality === 'review').slice(0, 4)) {
    const region = originalFaceRegion(face.box);
    const found = await detectRegion(region);
    passes++;
    const candidates = found.filter(valid).map(local => mapFace(local, region)).filter(valid)
      .map(candidate => ({ candidate, overlap: overlap(face.box, candidate.box) }))
      .filter(entry => entry.overlap >= .5).sort((a, b) => b.overlap - a.overlap);
    const best = candidates[0];
    if (!best || candidates[1] && best.overlap - candidates[1].overlap < .1) continue;
    // Geometry alone must not let an adjacent face replace this descriptor.
    const distance = Math.hypot(...face.descriptor.map((value, i) => value - best.candidate.descriptor[i]));
    if (distance > .35) continue;
    face.descriptor = best.candidate.descriptor;
    face.thumbnail = best.candidate.thumbnail;
  }
  // Extra recall is for user confirmation, never broader automatic linking.
  return { faces: faces.map(face => ({ ...face, quality: 'review' as const })), passes };
}
