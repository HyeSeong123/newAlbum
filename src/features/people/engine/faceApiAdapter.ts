import * as api from '@vladmandic/face-api/dist/face-api.esm-nobundle.js';
import * as tf from '@tensorflow/tfjs';
import { setThreadsCount, setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { FACE_MODEL, type FaceBackend, type FaceFeatures, type FaceModelAdapter } from './types';

// No second bundled TF registry. These exact versions are pinned together.
export class FaceApiAdapter implements FaceModelAdapter {
  async loadModel(base: string, backend: FaceBackend) {
    class MissingElement {}
    api.env.setEnv({
      Canvas: OffscreenCanvas, CanvasRenderingContext2D: new OffscreenCanvas(1, 1).getContext('2d')!.constructor,
      Image: MissingElement, Video: MissingElement, ImageData,
      createCanvasElement: () => new OffscreenCanvas(1, 1), createImageElement: () => new MissingElement(), createVideoElement: () => new MissingElement(), readFile: async () => { throw new Error('Worker file IO disabled'); }, fetch: globalThis.fetch.bind(globalThis),
    } as unknown as api.Environment);
    setWasmPaths(`${base}runtime/`); setThreadsCount(1);
    tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    let chosen = backend;
    if (backend === 'auto') {
      try { chosen = await tf.setBackend('wasm') ? 'wasm' : 'cpu'; } catch { chosen = 'cpu'; }
    }
    if (!await tf.setBackend(chosen === 'auto' ? 'cpu' : chosen)) throw new Error('얼굴 실행 환경을 시작하지 못했습니다.');
    await tf.ready();
    try {
      await Promise.all([api.nets.ssdMobilenetv1.loadFromUri(base), api.nets.faceLandmark68Net.loadFromUri(base), api.nets.faceRecognitionNet.loadFromUri(base)]);
    } catch (error) { this.disposeModel(); throw error; }
  }
  async detectFaces(image: OffscreenCanvas): Promise<FaceFeatures[]> {
    // Keep FaceAPI's 68-point alignment and original descriptor pipeline.
    const faces = await api.detectAllFaces(image as unknown as HTMLCanvasElement,
      new api.SsdMobilenetv1Options({ minConfidence: 0.65, maxResults: 100 })).withFaceLandmarks().withFaceDescriptors();
    return Promise.all(faces.map(async (face) => {
      const { x, y, width, height } = face.detection.box;
      const size = Math.min(Math.max(width, height) * 1.35, image.width, image.height);
      const left = Math.max(0, Math.min(image.width - size, x + width / 2 - size / 2));
      const top = Math.max(0, Math.min(image.height - size, y + height / 2 - size / 2));
      const crop = new OffscreenCanvas(144, 144);
      crop.getContext('2d')!.drawImage(image, left, top, size, size, 0, 0, 144, 144);
      const blob = await crop.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const thumbnail = `data:image/jpeg;base64,${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))}`;
      const eyes = [face.landmarks.getLeftEye(), face.landmarks.getRightEye()].map((points) => ({
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      }));
      const rollDegrees = Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x) * 180 / Math.PI;
      const nose = face.landmarks.getNose()[3];
      const eyeSpan = Math.abs(eyes[1].x - eyes[0].x);
      const asymmetry = Math.abs(nose.x - (eyes[0].x + eyes[1].x) / 2) / Math.max(eyeSpan, 1);
      const usable = Math.min(width, height) >= 60 && Math.abs(rollDegrees) <= 25 && asymmetry <= 0.35;
      return { descriptor: Array.from(face.descriptor), thumbnail, modelVersion: FACE_MODEL,
        box: [x / image.width, y / image.height, width / image.width, height / image.height],
        quality: usable ? 'usable' : 'review', view: 'unknown', rollDegrees };
    }));
  }
  // The public operation is deliberately the same landmark-aligned pipeline.
  async extractDescriptor(image: OffscreenCanvas) { const faces = await this.detectFaces(image); if (faces.length !== 1) throw new Error('하나의 얼굴을 선택해 주세요.'); return faces[0].descriptor; }
  getModelVersion() { return FACE_MODEL; }
  disposeModel() { for (const net of [api.nets.ssdMobilenetv1, api.nets.faceLandmark68Net, api.nets.faceRecognitionNet]) if (net.isLoaded) net.dispose(); }
}
export function runtimeInfo() {
  const memory = tf.memory();
  return { backend: tf.getBackend(), tensors: memory.numTensors, tensorBytes: memory.numBytes,
    simd: tf.getBackend() === 'wasm' && tf.env().getBool('WASM_HAS_SIMD_SUPPORT') };
}
