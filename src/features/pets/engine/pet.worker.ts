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
scope.onmessage = async (event: MessageEvent<{ id: number; width: number; height: number; pixels: ArrayBuffer; modelBase: string; viewHint: PetView; regions?: PetFeatures[] }>) => {
  const { id, width,height, pixels:pixelBuffer,modelBase,viewHint,regions } = event.data;
  const started=performance.now();
  try {
    const { detector, embedding } = await loadModels(modelBase);
    const rgba=new Uint8ClampedArray(pixelBuffer);
    if(width<1 || height<1 || width>640 || height>640 || rgba.length!==width*height*4)throw new Error('올바르지 않은 분석 사진입니다.');
    const canvas = new OffscreenCanvas(width,height);
    canvas.getContext('2d')!.putImageData(new ImageData(rgba,width,height),0,0);
    let objects: coco.DetectedObject[] = [];
    if (!regions) {
      const input = pixels(canvas);
      try { objects = await detector.detect(input, 20, 0.55); } finally { input.dispose(); }
    } else if (regions.length > 20) throw new Error('분석 영역이 너무 많습니다.');
    const features: PetFeatures[] = [];
    const animals = regions ? regions.map(region => ({ class: region.kind, score: region.detectionScore, bbox: [region.box[0]*width,region.box[1]*height,region.box[2]*width,region.box[3]*height] as [number,number,number,number], region })) : objects.filter(object => object.class === 'dog' || object.class === 'cat').sort((a,b) => a.bbox[0] - b.bbox[0] || a.bbox[1] - b.bbox[1]).map(object => ({...object,region:undefined}));
    for (const object of animals) {
      const hint = object.region?.view ?? (animals.length === 1 ? viewHint : 'unknown');
      const view = hint !== 'unknown' ? { view: hint, viewSource: 'user' as const } : conservativeViewAnalyzer.analyze();
      const [x,y,w,h] = object.bbox;
      const x0 = Math.max(0,x), y0 = Math.max(0,y), x1 = Math.min(width,x+w), y1 = Math.min(height,y+h);
      if (x1-x0 < 8 || y1-y0 < 8) continue;
      const crop = new OffscreenCanvas(224,224), context = crop.getContext('2d')!;
      context.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,224,224);
      const descriptors = cropDescriptors(context.getImageData(0,0,224,224).data,224,224,(x1-x0)/(y1-y0));
      const vector = view.view === 'rear' ? [] : await appearance(crop,embedding);
      context.save(); context.translate(224,0); context.scale(-1,1); context.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,224,224); context.restore();
      const mirror = view.view === 'rear' ? [] : await appearance(crop,embedding);
      let faceBox = object.region?.faceBox;
      let faceAppearance: number[] = [], mirroredFaceAppearance: number[] = [];
      if (view.view === 'rear' || view.view === 'unknown') faceBox = undefined;
      if (faceBox) {
        const [fx,fy,fw,fh] = faceBox;
        if (![fx,fy,fw,fh].every(Number.isFinite) || fx*width < x0-0.01 || fy*height < y0-0.01 || (fx+fw)*width > x1+0.01 || (fy+fh)*height > y1+0.01 || fw*width < 8 || fh*height < 8) throw new Error('얼굴 영역을 동물 테두리 안에서 조금 더 크게 지정해 주세요.');
        context.drawImage(canvas,fx*width,fy*height,fw*width,fh*height,0,0,224,224);
        faceAppearance = await appearance(crop,embedding);
        context.save();context.translate(224,0);context.scale(-1,1);context.drawImage(canvas,fx*width,fy*height,fw*width,fh*height,0,0,224,224);context.restore();
        mirroredFaceAppearance = await appearance(crop,embedding);
      }
      features.push({ kind: object.class as 'dog' | 'cat', detectedKind: object.region?.detectedKind ?? object.class as 'dog'|'cat', ...view,
        box: object.region?.box ?? [x0/width,y0/height,(x1-x0)/width,(y1-y0)/height],
        detectionScore: object.score, appearance: vector, mirroredAppearance: mirror, faceBox, faceAppearance, mirroredFaceAppearance, ...descriptors });
    }
    let min=255,max=0;for(let i=0;i<rgba.length;i++){if(i%4===3)continue;min=Math.min(min,rgba[i]);max=Math.max(max,rgba[i]);}
    scope.postMessage({ id,features,diagnostics:{width,height,inputRange:[min,max],elapsedMs:performance.now()-started,tensors:tf.memory().numTensors,animals:features.length} });
  } catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
