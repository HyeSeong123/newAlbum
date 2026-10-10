import { FaceApiAdapter, runtimeInfo } from './faceApiAdapter';
import type { FaceBackend } from './types';
const adapter = new FaceApiAdapter();
let loaded: Promise<void> | undefined;
let preference: FaceBackend | undefined;
let modelLoadMs = 0;
let wasmFailed = false;
globalThis.onmessage = async ({ data }: MessageEvent) => {
  const { id, modelBase, backend = 'auto', pixels, width, height } = data;
  const started = performance.now();
  const run = async (selected: FaceBackend) => {
    if (preference !== selected) { adapter.disposeModel(); loaded = undefined; preference = selected; }
    loaded ??= (async () => { const start = performance.now(); await adapter.loadModel(modelBase, selected); modelLoadMs = performance.now() - start; })();
    await loaded;
    let faces;
    if (pixels) {
      if (width <= 0 || height <= 0 || Math.max(width, height) > 1600 || pixels.byteLength !== width * height * 4) throw new Error('잘못된 사진 크기');
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
      faces = await adapter.detectFaces(canvas);
      canvas.width = canvas.height = 1;
    }
    return { id, faces, diagnostics: { ...runtimeInfo(), elapsedMs: performance.now() - started, modelLoadMs } };
  };
  try {
    try { globalThis.postMessage(await run(backend === 'auto' && wasmFailed ? 'cpu' : backend)); }
    catch (error) {
      if (backend !== 'auto' || runtimeInfo().backend !== 'wasm') throw error;
      wasmFailed = true; adapter.disposeModel(); loaded = undefined; preference = undefined;
      globalThis.postMessage(await run('cpu'));
    }
  } catch {
    adapter.disposeModel(); loaded = undefined;
    // Do not forward model/descriptor/input exceptions into logs or UI.
    globalThis.postMessage({ id, error: '얼굴 분석을 완료하지 못했습니다. 다시 시도해 주세요.' });
  }
};
