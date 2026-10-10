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
  return result;
}
