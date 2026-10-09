/// <reference lib="webworker" />
import * as tf from '@tensorflow/tfjs';
import * as coco from '@tensorflow-models/coco-ssd';
import { cropDescriptors, normalize } from './features';
import { conservativeViewAnalyzer, type PetFeatures, type PetView } from './types';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let models: Promise<{ detector: coco.ObjectDetection; embedding: tf.LayersModel }> | undefined;
function loadModels(base: string) {
  return models ??= (async () => {
    await tf.setBackend('cpu'); await tf.ready();
    const detector = await coco.load({ modelUrl: `${base}detector/model.json` });
    try {
      const original = await tf.loadLayersModel(`${base}embedding/model.json`);
      const embedding = tf.model({ inputs: original.inputs, outputs: original.getLayer('global_average_pooling2d_1').output });
      return { detector, embedding };
    } catch (error) { detector.dispose(); throw error; }
  })().catch(error => { models = undefined; throw error; });
}
function pixels(canvas: OffscreenCanvas): tf.Tensor3D {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Int32Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4) { rgb[j++] = data[i]; rgb[j++] = data[i+1]; rgb[j++] = data[i+2]; }
  return tf.tensor3d(rgb, [canvas.height, canvas.width, 3], 'int32');
}
async function appearance(canvas: OffscreenCanvas, embedding: tf.LayersModel): Promise<number[]> {
  const output = tf.tidy(() => embedding.predict(pixels(canvas).toFloat().div(127.5).sub(1).expandDims(0)) as tf.Tensor);
  try { return normalize(Array.from(await output.data())); } finally { output.dispose(); }
}
scope.onmessage = async (event: MessageEvent<{ id: number; bitmap: ImageBitmap; modelBase: string; viewHint: PetView }>) => {
  const { id, bitmap, modelBase, viewHint } = event.data;
  try {
    const { detector, embedding } = await loadModels(modelBase);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const input = pixels(canvas);
    let objects: coco.DetectedObject[];
    try { objects = await detector.detect(input, 20, 0.55); } finally { input.dispose(); }
    const features: PetFeatures[] = [];
    const animals = objects.filter(object => object.class === 'dog' || object.class === 'cat').sort((a,b) => a.bbox[0] - b.bbox[0] || a.bbox[1] - b.bbox[1]);
    for (const object of animals) {
      const view = animals.length === 1 && viewHint !== 'unknown' ? { view: viewHint, viewSource: 'user' as const } : conservativeViewAnalyzer.analyze();
      const [x,y,w,h] = object.bbox;
      const x0 = Math.max(0,x), y0 = Math.max(0,y), x1 = Math.min(bitmap.width,x+w), y1 = Math.min(bitmap.height,y+h);
      if (x1-x0 < 8 || y1-y0 < 8) continue;
      const crop = new OffscreenCanvas(224,224), context = crop.getContext('2d')!;
      context.drawImage(bitmap,x0,y0,x1-x0,y1-y0,0,0,224,224);
      const descriptors = cropDescriptors(context.getImageData(0,0,224,224).data,224,224,(x1-x0)/(y1-y0));
      const vector = view.view === 'rear' ? [] : await appearance(crop,embedding);
      context.save(); context.translate(224,0); context.scale(-1,1); context.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,224,224); context.restore();
      const mirror = view.view === 'rear' ? [] : await appearance(crop,embedding);
      features.push({ kind: object.class as 'dog' | 'cat', ...view,
        box: [x0/bitmap.width,y0/bitmap.height,(x1-x0)/bitmap.width,(y1-y0)/bitmap.height],
        detectionScore: object.score, appearance: vector, mirroredAppearance: mirror, ...descriptors });
    }
    scope.postMessage({ id, features, tensors: tf.memory().numTensors });
  } catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
  finally { bitmap.close(); }
};
