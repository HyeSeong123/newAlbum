/** Independently implemented RGB/tensor contract; shared by training and Worker. */
export const PREPROCESS = 'rgb8-hwc-nearest-exif-v1-minus1plus1';
export const INPUT_SIZE = 8;
export interface RGBImage { width: number; height: number; channels: 3 | 4; data: Uint8Array | Uint8ClampedArray; orientation?: number }
export function validateImage(image: RGBImage) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 16_000_000 || ![3, 4].includes(image.channels) || !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * image.channels || !Number.isInteger(image.orientation ?? 1) || (image.orientation ?? 1) < 1 || (image.orientation ?? 1) > 8) throw new Error('INVALID_IMAGE');
}
export function finiteVector(v: ArrayLike<number>, dimensions: number) {
  if (!v || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65536 || v.length !== dimensions) throw new Error('INVALID_DIMENSIONS');
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) throw new Error('NON_FINITE_VECTOR');
}
export function normalize(v: ArrayLike<number>): Float32Array {
  finiteVector(v, v.length);
  // Scale first so very large finite inputs cannot overflow the sum of squares.
  let scale = 0; for (let i = 0; i < v.length; i++) scale = Math.max(scale, Math.abs(v[i]));
  if (scale === 0) throw new Error('ZERO_VECTOR');
  let sum = 0; for (let i = 0; i < v.length; i++) sum += (v[i] / scale) ** 2;
  return Float32Array.from(v, x => (x / scale) / Math.sqrt(sum));
}
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  finiteVector(b, a.length); const u = normalize(a), v = normalize(b);
  let sum = 0; for (let i = 0; i < u.length; i++) sum += u[i] * v[i];
  return Math.max(-1, Math.min(1, sum));
}
export const cosineDistance = (a: ArrayLike<number>, b: ArrayLike<number>) => 1 - cosine(a, b);
/** EXIF 1..8 into display coordinates; alpha is deliberately ignored. */
export function orientRGB(image: RGBImage): RGBImage {
  validateImage(image);
  const { width: w, height: h, channels: c, data } = image, o = image.orientation ?? 1;
  const width = o >= 5 ? h : w, height = o >= 5 ? w : h;
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [dx, dy] = o === 2 ? [w - 1 - x, y] : o === 3 ? [w - 1 - x, h - 1 - y] : o === 4 ? [x, h - 1 - y] : o === 5 ? [y, x] : o === 6 ? [h - 1 - y, x] : o === 7 ? [h - 1 - y, w - 1 - x] : o === 8 ? [y, w - 1 - x] : [x, y];
    for (let k = 0; k < 3; k++) out[(dy * width + dx) * 3 + k] = data[(y * w + x) * c + k];
  }
  return { width, height, channels: 3, data: out, orientation: 1 };
}
export function preprocess(image: RGBImage): Float32Array {
  const rgb = orientRGB(image), out = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let y = 0; y < INPUT_SIZE; y++) for (let x = 0; x < INPUT_SIZE; x++) {
    const sx = Math.min(rgb.width - 1, Math.floor((x + 0.5) * rgb.width / INPUT_SIZE));
    const sy = Math.min(rgb.height - 1, Math.floor((y + 0.5) * rgb.height / INPUT_SIZE));
    for (let c = 0; c < 3; c++) out[(y * INPUT_SIZE + x) * 3 + c] = rgb.data[(sy * rgb.width + sx) * 3 + c] / 127.5 - 1;
  }
  return out;
}
export interface Feature {
  model: string; weightsSha256: string; preprocess: string; task: 'person' | 'pet';
  kind: 'identity' | 'color-shape'; vector: number[]; view: 'front' | 'left' | 'right' | 'rear' | 'unknown';
  species?: 'dog' | 'cat'; mirrored?: number[];
}
export function matchFeature(query: Feature, reference: Feature) {
  if (query.model !== reference.model || query.weightsSha256 !== reference.weightsSha256 || !/^[a-f0-9]{64}$/.test(query.weightsSha256) || query.preprocess !== reference.preprocess || query.task !== reference.task || query.kind !== reference.kind) throw new Error('INCOMPATIBLE_FEATURE_SPACE');
  if (query.task === 'person' && (query.kind !== 'identity' || query.vector.length !== 512)) throw new Error('INVALID_PERSON_FEATURE');
  if (query.task === 'pet' && (!query.species || query.species !== reference.species)) throw new Error('SPECIES_MISMATCH');
  if ((query.view === 'rear' || reference.view === 'rear') && (query.task !== 'pet' || query.kind !== 'color-shape')) throw new Error('REAR_IDENTITY_FORBIDDEN');
  finiteVector(query.vector, reference.vector.length);
  const scores = [cosine(query.vector, reference.vector)];
  if (query.task === 'pet' && query.view !== 'rear' && reference.view !== 'rear') {
    for (const [a, b] of [[query.mirrored, reference.vector], [query.vector, reference.mirrored]]) if (a && b) scores.push(cosine(a, b));
  }
  return { similarity: Math.max(...scores), needsReview: true as const, autoLink: false as const };
}
