// A shared mobile memory budget: only one domain may hold an inference model.
// Each domain retains its own vectors, backend and Worker.
const disposers = new Map<string, () => void>();
let tail: Promise<unknown> = Promise.resolve();
let owner: string | undefined;
export function registerAIWorker(domain: string, dispose: () => void) { disposers.set(domain, dispose); }
export function runAI<T>(domain: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const result = tail.then(async () => {
    signal?.throwIfAborted();
    if (owner !== domain) { if (owner) disposers.get(owner)?.(); owner = domain; }
    return task();
  });
  tail = result.catch(() => undefined);
  if (!signal) return result;
  // Cancellation must settle immediately even while another domain is busy.
  // Keep the scheduler's tail attached to the actual work, so abort cannot
  // accidentally release its slot or allow overlapping inference.
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? new DOMException('분석 중단', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    result.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}
