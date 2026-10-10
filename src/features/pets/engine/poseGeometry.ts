import type { PetView } from './types';

export const PET_POSE_MODEL = 'quadpose-ap10k-52f0329b-v1';
export interface PetKeypoint { x: number; y: number; score: number }
export interface PetPose { modelVersion: typeof PET_POSE_MODEL; view: PetView; keypoints: PetKeypoint[] }

// ONNX output is [1,17,64,64] (CHW), unlike SnapML's HWC output.
// Quarter-cell refinement is deliberately used; upstream DARK benchmark numbers
// do not describe our decoder or orientation rule.
export function decodePetHeatmaps(data: Float32Array, dimensions: readonly number[]): PetKeypoint[] {
  if (dimensions.join(',') !== '1,17,64,64' || data.length !== 17 * 4096) throw new Error('Invalid animal pose heatmaps');
  const points: PetKeypoint[] = [];
  for (let k = 0; k < 17; k++) {
    const offset = k * 4096; let index = 0;
    for (let i = 0; i < 4096; i++) { if (!Number.isFinite(data[offset + i])) throw new Error('Invalid pose value'); if (data[offset + i] > data[offset + index]) index = i; }
    const ix = index % 64, iy = Math.floor(index / 64); let x = ix, y = iy;
    if (ix > 1 && ix < 63 && iy > 0 && iy < 64) x += Math.sign(data[offset + iy * 64 + ix + 1] - data[offset + iy * 64 + ix - 1]) * .25;
    if (iy > 1 && iy < 63 && ix > 0 && ix < 64) y += Math.sign(data[offset + (iy + 1) * 64 + ix] - data[offset + (iy - 1) * 64 + ix]) * .25;
    points.push({ x: x / 64, y: y / 64, score: data[offset + index] });
  }
  return points;
}

// LEFT/RIGHT means the muzzle points toward the left/right of the displayed
// photograph. A sideways body or one visible eye alone is not direction.
export function petHeadDirection(points: readonly PetKeypoint[]): PetView {
  if (points.length !== 17 || points.some(p => ![p.x, p.y, p.score].every(Number.isFinite))) return 'unknown';
  const [leftEye, rightEye, nose, neck] = points;
  if (nose.score < .35 || neck.score < .35 || Math.max(leftEye.score, rightEye.score) < .35) return 'unknown';
  const eyes = [leftEye, rightEye].filter(p => p.score >= .35);
  const eyeX = eyes.reduce((s, p) => s + p.x, 0) / eyes.length;
  const eyeY = eyes.reduce((s, p) => s + p.y, 0) / eyes.length;
  const span = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const head = Math.hypot(nose.x - neck.x, nose.y - neck.y);
  if (head < .04 || head > .65) return 'unknown';
  const dx = nose.x - eyeX, dy = nose.y - eyeY, limit = Math.max(.035, .6 * span);
  if (Math.abs(dx) > limit && Math.abs(dx) > Math.abs(dy) * .7 && (nose.x - neck.x) * dx > 0) return dx < 0 ? 'left' : 'right';
  if (eyes.length === 2 && span > .035 && Math.abs(leftEye.y - rightEye.y) < span * .7 && Math.abs(dx) < span * .3 && dy > span * .15) return 'front';
  // Face detection failure is not evidence of REAR. Manual rear correction
  // still clears identity embeddings in the existing pipeline.
  return 'unknown';
}
