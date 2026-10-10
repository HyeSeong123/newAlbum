// Test-only frozen original main-thread pipeline. Never used by the app.
import * as api from '@vladmandic/face-api';
export async function originalFacePipeline(url:string) {
  const runtime=api.tf as unknown as typeof import('@tensorflow/tfjs');await runtime.setBackend('cpu');await runtime.ready();
  await Promise.all([api.nets.ssdMobilenetv1.loadFromUri('/models/faces'),api.nets.faceLandmark68Net.loadFromUri('/models/faces'),api.nets.faceRecognitionNet.loadFromUri('/models/faces')]);
  try {
    const bitmap=await createImageBitmap(await(await fetch(url)).blob());
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const start=performance.now();
    const faces=await api.detectAllFaces(canvas,new api.SsdMobilenetv1Options({minConfidence:0.65,maxResults:100})).withFaceLandmarks().withFaceDescriptors();
    return {elapsedMs:performance.now()-start,descriptors:faces.map((f)=>Array.from(f.descriptor)), boxes:faces.map((f)=>[f.detection.box.x,f.detection.box.y,f.detection.box.width,f.detection.box.height]), tfVersion:runtime.version};
  } finally {api.nets.ssdMobilenetv1.dispose();api.nets.faceLandmark68Net.dispose();api.nets.faceRecognitionNet.dispose();}
}
