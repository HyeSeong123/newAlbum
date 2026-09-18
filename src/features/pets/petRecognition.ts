import * as tf from '@tensorflow/tfjs';
import * as coco from '@tensorflow-models/coco-ssd';

export interface PetFeature { kind: string; vector: number[] }
let engine: Promise<{ detector: coco.ObjectDetection; embedding: tf.LayersModel }> | undefined;
function loadEngine() {
  return engine ??= (async () => {
    await tf.ready();
    const detector = await coco.load({ modelUrl: '/models/pets/detector/model.json' });
    try {
      const base = await tf.loadLayersModel('/models/pets/embedding/model.json');
      const embedding = tf.model({ inputs: base.inputs, outputs: base.getLayer('global_average_pooling2d_1').output });
      return { detector, embedding };
    } catch (error) { detector.dispose(); throw error; }
  })().catch((error) => { engine = undefined; throw error; });
}

let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<PetFeature[]>>();
export function describePets(url: string): Promise<PetFeature[]> {
  const cached = cache.get(url);
  if (cached) return cached;
  const next = queue.then(() => describe(url)).catch((error) => { cache.delete(url); throw error; });
  if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
  cache.set(url, next);
  queue = next.catch(() => undefined);
  return next;
}

async function describe(url: string): Promise<PetFeature[]> {
  const { detector, embedding } = await loadEngine();
  const image = new Image();
  image.crossOrigin = 'anonymous';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { image.src = ''; reject(new Error('사진 읽기 시간 초과')); }, 30000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('사진 읽기 실패')); };
      image.src = url;
    });
    const detected = await detector.detect(image, 20, 0.55);
    const features: PetFeature[] = [];
    for (const object of detected.filter((entry) => entry.class === 'dog' || entry.class === 'cat')) {
      const [x, y, w, h] = object.bbox;
      const crop = document.createElement('canvas');
      crop.width = 224; crop.height = 224;
      crop.getContext('2d')!.drawImage(image, Math.max(0, x), Math.max(0, y), Math.min(w, image.naturalWidth - Math.max(0, x)), Math.min(h, image.naturalHeight - Math.max(0, y)), 0, 0, 224, 224);
      const vector = tf.tidy(() => {
        const input = tf.browser.fromPixels(crop).toFloat().div(127.5).sub(1).expandDims(0);
        return Array.from((embedding.predict(input) as tf.Tensor).dataSync());
      });
      const norm = Math.hypot(...vector);
      if (norm > 0 && vector.every(Number.isFinite)) features.push({ kind: object.class, vector: vector.map((v) => v / norm) });
    }
    return features;
  } finally { image.src = ''; }
}

export function similarity(reference: PetFeature[], candidate: PetFeature[]): number {
  let best = 0;
  for (const a of reference) for (const b of candidate) {
    if (a.kind !== b.kind || a.vector.length !== b.vector.length) continue;
    best = Math.max(best, a.vector.reduce((sum, value, index) => sum + value * b.vector[index], 0));
  }
  return Math.min(1, best);
}
