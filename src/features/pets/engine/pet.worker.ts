/// <reference lib="webworker" />
import * as tf from '@tensorflow/tfjs';
import * as coco from '@tensorflow-models/coco-ssd';
import { cropDescriptors, normalize, validPetVector } from './features';
import { conservativeViewAnalyzer, type PetFeatures, type PetView } from './types';
import { disablePetWasm, petRuntimeInfo, selectPetBackend, type PetBackendPreference } from './runtime';
import { detectCatFrontFace } from './catFace';
import catFaceCascade from './cat-face-cascade.json';
import { foregroundDescriptors } from './foreground';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let models: Promise<{ detector: coco.ObjectDetection; embedding: tf.LayersModel }> | undefined;
function loadModels(base: string) {
  return models ??= (async () => {
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
class PetInputError extends Error {}
interface PetRequest { id: number; width: number; height: number; pixels: ArrayBuffer; modelBase: string; viewHint: PetView; regions?: PetFeatures[]; backend?: PetBackendPreference }
async function infer(request: PetRequest) {
  const { width,height, pixels:pixelBuffer,modelBase,viewHint,regions } = request;
  const started=performance.now();
  const timings = { initializationMs:0, detectionMs:0, bodyEmbeddingMs:0, faceDetectionMs:0, faceEmbeddingMs:0, descriptorMs:0 };
  let reusedBodies = 0;
  const rgba=new Uint8ClampedArray(pixelBuffer);
  if(width<1 || height<1 || width>640 || height>640 || rgba.length!==width*height*4)throw new PetInputError('올바르지 않은 분석 사진입니다.');
  if (regions && regions.length > 20) throw new PetInputError('분석 영역이 너무 많습니다.');
  const { detector, embedding } = await loadModels(modelBase);
  timings.initializationMs = performance.now()-started;
  const canvas = new OffscreenCanvas(width,height);
  canvas.getContext('2d')!.putImageData(new ImageData(rgba,width,height),0,0);
  let objects: coco.DetectedObject[] = [];
  if (!regions) {
    const detectedAt=performance.now();
    const input = pixels(canvas);
    try { objects = await detector.detect(input, 20, 0.55); } finally { input.dispose(); }
    timings.detectionMs += performance.now()-detectedAt;
  }
  const features: PetFeatures[] = [];
  const animals = regions ? regions.map(region => ({ class: region.kind, score: region.detectionScore, bbox: [region.box[0]*width,region.box[1]*height,region.box[2]*width,region.box[3]*height] as [number,number,number,number], region })) : objects.filter(object => object.class === 'dog' || object.class === 'cat').sort((a,b) => a.bbox[0] - b.bbox[0] || a.bbox[1] - b.bbox[1]).map(object => ({...object,region:undefined}));
  for (const object of animals) {
    const hint = object.region?.view ?? (animals.length === 1 ? viewHint : 'unknown');
    let view: Pick<PetFeatures,'view'|'viewSource'> = hint !== 'unknown' ? { view: hint, viewSource: 'user' } : conservativeViewAnalyzer.analyze();
    const [x,y,w,h] = object.bbox;
    const x0 = Math.max(0,x), y0 = Math.max(0,y), x1 = Math.min(width,x+w), y1 = Math.min(height,y+h);
    if (x1-x0 < 8 || y1-y0 < 8) continue;
    const crop = new OffscreenCanvas(224,224), context = crop.getContext('2d')!;
    context.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,224,224);
    let autoFaceBox: PetFeatures['faceBox'];
    // Run only on detected cats and fresh scans. Corrections (including clearing
    // a face box) always obey the user's selection. Failure is not rear evidence.
    if(!object.region && object.class==='cat' && (hint==='unknown' || hint==='front')) {
      const at=performance.now(),scale=224/Math.max(x1-x0,y1-y0);
      const faceCanvas=new OffscreenCanvas(Math.max(1,Math.round((x1-x0)*scale)),Math.max(1,Math.round((y1-y0)*scale))),faceContext=faceCanvas.getContext('2d')!;
      faceContext.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,faceCanvas.width,faceCanvas.height);
      const face=detectCatFrontFace(faceContext.getImageData(0,0,faceCanvas.width,faceCanvas.height).data,faceCanvas.width,faceCanvas.height,catFaceCascade);
      timings.faceDetectionMs+=performance.now()-at;
      if(face && face[2]*(x1-x0)>=8 && face[3]*(y1-y0)>=8) {
        autoFaceBox=[(x0+face[0]*(x1-x0))/width,(y0+face[1]*(y1-y0))/height,face[2]*(x1-x0)/width,face[3]*(y1-y0)/height];
        if(hint==='unknown')view={view:'front',viewSource:'cat-frontal-cascade'};
      }
    }
    const descriptorAt=performance.now();
    const cropData=context.getImageData(0,0,224,224).data,aspect=(x1-x0)/(y1-y0);
    const descriptors = {...cropDescriptors(cropData,224,224,aspect),foreground:foregroundDescriptors(cropData,224,224,aspect)};
    timings.descriptorMs += performance.now()-descriptorAt;
    // manager.ts verifies the content fingerprint before sending corrections.
    // Only complete, finite body vectors can be reused; rear always clears them.
    const reuseBody = !!object.region && validPetVector(object.region.appearance,1024) && validPetVector(object.region.mirroredAppearance,1024);
    const bodyAt=performance.now();
    const vector = view.view === 'rear' ? [] : reuseBody ? object.region!.appearance : await appearance(crop,embedding);
    context.save(); context.translate(224,0); context.scale(-1,1); context.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,224,224); context.restore();
    const mirror = view.view === 'rear' ? [] : reuseBody ? object.region!.mirroredAppearance : await appearance(crop,embedding);
    if(reuseBody && view.view!=='rear')reusedBodies++;
    timings.bodyEmbeddingMs += performance.now()-bodyAt;
    let faceBox = object.region?.faceBox ?? autoFaceBox;
    let faceAppearance: number[] = [], mirroredFaceAppearance: number[] = [];
    if (view.view === 'rear' || view.view === 'unknown') faceBox = undefined;
    if (faceBox) {
      const [fx,fy,fw,fh] = faceBox;
      if (![fx,fy,fw,fh].every(Number.isFinite) || fx*width < x0-0.01 || fy*height < y0-0.01 || (fx+fw)*width > x1+0.01 || (fy+fh)*height > y1+0.01 || fw*width < 8 || fh*height < 8) throw new PetInputError('얼굴 영역을 동물 테두리 안에서 조금 더 크게 지정해 주세요.');
      const faceAt=performance.now();
      context.drawImage(canvas,fx*width,fy*height,fw*width,fh*height,0,0,224,224);
      faceAppearance = await appearance(crop,embedding);
      context.save();context.translate(224,0);context.scale(-1,1);context.drawImage(canvas,fx*width,fy*height,fw*width,fh*height,0,0,224,224);context.restore();
      mirroredFaceAppearance = await appearance(crop,embedding);
      timings.faceEmbeddingMs += performance.now()-faceAt;
    }
    features.push({ kind: object.class as 'dog' | 'cat', detectedKind: object.region?.detectedKind ?? object.class as 'dog'|'cat', ...view,
      box: object.region?.box ?? [x0/width,y0/height,(x1-x0)/width,(y1-y0)/height],
      detectionScore: object.score, appearance: vector, mirroredAppearance: mirror, faceBox, faceAppearance, mirroredFaceAppearance, ...descriptors });
  }
  let min=255,max=0;for(let i=0;i<rgba.length;i++){if(i%4===3)continue;min=Math.min(min,rgba[i]);max=Math.max(max,rgba[i]);}
  return { features,diagnostics:{width,height,inputRange:[min,max],elapsedMs:performance.now()-started,animals:features.length,reusedBodies,...petRuntimeInfo(),...timings} };
}
scope.onmessage = async (event: MessageEvent<PetRequest>) => {
  const request=event.data, started=performance.now();
  try {
    const selected=await selectPetBackend(request.modelBase,request.backend);
    const backendInitializationMs=performance.now()-started;
    let result;
    let retryMs=0;
    try { result=await infer(request); }
    catch(error) {
      if(selected!=='wasm' || error instanceof PetInputError)throw error;
      // A missing kernel or WASM runtime failure never leaves a partial result.
      // Switch the same weights to CPU and retry once; no remote runtime fallback.
      retryMs=performance.now()-started;
      disablePetWasm();await selectPetBackend(request.modelBase,'cpu');
      result=await infer(request);
    }
    scope.postMessage({id:request.id,...result,diagnostics:{...result.diagnostics,backendInitializationMs,retryMs,totalMs:performance.now()-started}});
  } catch (error) { scope.postMessage({ id:request.id, error: error instanceof Error ? error.message : String(error) }); }
};
