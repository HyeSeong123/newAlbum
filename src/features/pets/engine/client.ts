import type { PetFeatures, PetView } from './types';
let worker: Worker | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;
let queue: Promise<unknown> = Promise.resolve();
export function cancelPetInference() { clearTimeout(idleTimer); worker?.terminate(); worker = undefined; }
// One worker, one image at a time; decoded source is already a native thumbnail.
export function analyzePetImage(url: string, signal?: AbortSignal, viewHint: PetView = 'unknown'): Promise<PetFeatures[]> {
  const task = queue.then(async () => {
    clearTimeout(idleTimer);
    signal?.throwIfAborted();
    if (!globalThis.Worker || !globalThis.createImageBitmap || !globalThis.OffscreenCanvas) throw new Error('이 기기의 WebView에서 반려동물 분석을 지원하지 않습니다. WebView를 업데이트해 주세요.');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('분석용 사진을 읽지 못했습니다.');
    const blob = await response.blob();
    let bitmap = await createImageBitmap(blob);
    if (Math.max(bitmap.width, bitmap.height) > 640) {
      const scale = 640 / Math.max(bitmap.width, bitmap.height);
      const resized = await createImageBitmap(bitmap, { resizeWidth: Math.max(1,Math.round(bitmap.width*scale)), resizeHeight: Math.max(1,Math.round(bitmap.height*scale)) });
      bitmap.close(); bitmap = resized;
    }
    if (signal?.aborted) { bitmap.close(); signal.throwIfAborted(); }
    worker ??= new Worker(new URL('./pet.worker.ts', import.meta.url), { type: 'module' });
    const active = worker, id = ++requestId;
    return await new Promise<PetFeatures[]>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); active.removeEventListener('message', message); active.removeEventListener('error', error); };
      const abort = () => { cleanup(); cancelPetInference(); reject(new DOMException('분석을 중단했습니다.', 'AbortError')); };
      const error = () => { cleanup(); cancelPetInference(); reject(new Error('반려동물 분석을 시작하지 못했습니다. 다시 시도해 주세요.')); };
      const message = (event: MessageEvent) => { if (event.data.id !== id) return; cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.features); };
      const timer = setTimeout(() => { cleanup(); cancelPetInference(); reject(new Error('분석 시간이 초과되었습니다.')); }, 120_000);
      signal?.addEventListener('abort', abort, { once: true }); active.addEventListener('message', message); active.addEventListener('error', error);
      active.postMessage({ id, bitmap, viewHint, modelBase: new URL(`${import.meta.env.BASE_URL}models/pets/`, location.href).href }, [bitmap]);
    });
  });
  queue = task.catch(() => undefined).finally(() => { idleTimer = setTimeout(cancelPetInference,60_000); });
  return task;
}
