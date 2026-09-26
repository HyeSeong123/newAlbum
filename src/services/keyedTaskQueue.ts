/** Serialize writes to the same record without blocking unrelated records. */
export function createKeyedTaskQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(task);
    const settled = result.then(() => undefined, () => undefined);
    pending.set(key, settled);
    void settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
    return result;
  };
}
