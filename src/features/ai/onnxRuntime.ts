import * as ort from 'onnxruntime-web/wasm';

// The runtime, model and every WASM import ship inside the APK. Each inference
// domain owns its session in its existing Worker; there is no CDN fallback.
export async function loadOfflineOnnx(base: string, relative: string) {
  const root = new URL(base), model = new URL(relative, root);
  if (model.origin !== root.origin || !model.href.startsWith(root.href)) throw new Error('External model rejected');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('onnx-runtime/', root).href;
  const response = await fetch(model);
  if (!response.ok) throw new Error('앱에 포함된 인식 모델을 읽지 못했습니다.');
  return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}
export { ort };

export function rgbChw(rgba: Uint8ClampedArray, size: number, offset = 0, scale = 1) {
  if (rgba.length !== size * size * 4) throw new Error('Invalid model pixels');
  const count = size * size, data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) data[c * count + i] = (rgba[i * 4 + c] - offset) * scale;
  return new ort.Tensor('float32', data, [1, 3, size, size]);
}
