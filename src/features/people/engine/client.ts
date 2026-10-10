import { registerAIWorker, runAI } from '../../ai/runtime';
import type { FaceBackend, FaceDiagnostics, FaceFeatures } from './types';
let worker: Worker | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
export function disposePersonEngine() { clearTimeout(timer); worker?.terminate(); worker = undefined; }
registerAIWorker('people', disposePersonEngine);

function request(pixels?: ArrayBuffer, width?: number, height?: number, signal?: AbortSignal, backend: FaceBackend = 'auto', onDiagnostics?: (value:FaceDiagnostics)=>void): Promise<FaceFeatures[]> {
  signal?.throwIfAborted();
  if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) throw new Error('이 기기의 WebView에서 얼굴 분석을 지원하지 않습니다. WebView를 업데이트해 주세요.');
  clearTimeout(timer);
  worker ??= new Worker(new URL('./person.worker.ts', import.meta.url), { type: 'module' });
  const active = worker, id = ++nextId;
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); active.removeEventListener('message', message); active.removeEventListener('error', error); timer = setTimeout(disposePersonEngine, 60_000); };
    const abort = () => { cleanup(); disposePersonEngine(); reject(new DOMException('분석 중단', 'AbortError')); };
    const error = () => { cleanup(); disposePersonEngine(); reject(new Error('얼굴 분석 실행에 실패했습니다. 다시 시도해 주세요.')); };
    const message = (event: MessageEvent<{ id: number; error?: string; faces?: FaceFeatures[]; diagnostics: FaceDiagnostics }>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) { disposePersonEngine(); reject(new Error(event.data.error)); }
      else { onDiagnostics?.(event.data.diagnostics); window.dispatchEvent(new CustomEvent('gamjassak-person-diagnostics', { detail: event.data.diagnostics })); resolve(event.data.faces ?? []); }
    };
    const timeout = setTimeout(error, 120_000);
    signal?.addEventListener('abort', abort, { once: true });
    active.addEventListener('message', message); active.addEventListener('error', error);
    active.postMessage({ id, pixels, width, height, backend, modelBase: new URL(`${import.meta.env.BASE_URL}models/faces/`, location.href).href }, pixels ? [pixels] : []);
  });
}
export function loadPersonEngine(signal?: AbortSignal) { return runAI('people', () => request(undefined, undefined, undefined, signal), signal); }
export function analyzePersonImage(url: string, signal?: AbortSignal, backend: FaceBackend = 'auto', onDiagnostics?: (value:FaceDiagnostics)=>void) {
  return runAI('people', async () => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('사진을 읽지 못했습니다.');
    let bitmap = await createImageBitmap(await response.blob());
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      signal?.throwIfAborted();
      const canvas = new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)), Math.max(1,Math.round(bitmap.height*scale)));
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data.buffer as ArrayBuffer;
      return await request(pixels, canvas.width, canvas.height, signal, backend, onDiagnostics);
    } finally { bitmap.close(); }
  }, signal);
}
