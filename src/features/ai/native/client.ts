import { registerAIWorker, runAI } from '../runtime';
import { orientRGB, type RGBImage } from './core';
let loadedKey: string | undefined;
let worker: Worker | undefined, idle: ReturnType<typeof setTimeout> | undefined, next = 0, pending = 0;
export function disposeNativeAI() { clearTimeout(idle); worker?.terminate(); worker = undefined; loadedKey = undefined; }
registerAIWorker('native-ai', disposeNativeAI);
/** Developer pipeline probe only; never used as an identity result. No import hook. */
export function runSyntheticProbe(request: { intent: 'user-request'; image: RGBImage; modelUrl: string; sha256: string }, signal?: AbortSignal) {
  if (request.intent !== 'user-request' || pending >= 8) return Promise.reject(new Error('EXPLICIT_REQUEST_OR_QUEUE_LIMIT'));
  if (request.image.width * request.image.height > 256 * 256) return Promise.reject(new Error('PROBE_IMAGE_TOO_LARGE'));
  pending++;
  return runAI('native-ai', async () => {
    signal?.throwIfAborted(); clearTimeout(idle);
    const url = new URL(request.modelUrl, location.href);
    if (url.origin !== location.origin || !url.pathname.includes('/models/native-dev/') || url.search || url.hash) throw new Error('NON_LOCAL_MODEL');
    const key = `${url.href}:${request.sha256}`;
    let modelText: string | undefined;
    if (!worker || loadedKey !== key) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('MODEL_LOAD_FAILED');
      modelText = await response.text();
      if (modelText.length > 2_000_000) throw new Error('MODEL_TOO_LARGE');
    }
    signal?.throwIfAborted();
    const image = orientRGB(request.image), pixels = image.data.buffer as ArrayBuffer;
    worker ??= new Worker(new URL('./native.worker.ts', import.meta.url), { type: 'module' });
    const active = worker, id = ++next;
    return new Promise<{ task: string; probabilities: number[]; identitySupported: false }>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); active.removeEventListener('message', message); active.removeEventListener('error', error); idle = setTimeout(disposeNativeAI, 30_000); };
      const abort = () => { cleanup(); disposeNativeAI(); reject(new DOMException('분석 중단', 'AbortError')); };
      const error = () => { cleanup(); disposeNativeAI(); reject(new Error('NATIVE_WORKER_FAILED')); };
      const message = (event: MessageEvent) => { if (event.data.id !== id) return; cleanup(); if (event.data.error) { disposeNativeAI(); reject(new Error(event.data.error)); } else { loadedKey = key; resolve(event.data.result); } };
      const timeout = setTimeout(error, 30_000);
      signal?.addEventListener('abort', abort, { once: true }); active.addEventListener('message', message); active.addEventListener('error', error);
      active.postMessage({ id, pixels, width: image.width, height: image.height, modelText, sha256: request.sha256 }, [pixels]);
      if (signal?.aborted) abort();
    });
  }, signal).finally(() => { pending--; });
}
