import { useEffect, useState } from "react";

export function useMediaSelection(itemsById: ReadonlyMap<string, unknown>) {
  const [enabled, setEnabled] = useState(false);
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setIds((current) => {
      const retained = new Set([...current].filter((id) => itemsById.has(id)));
      return retained.size === current.size ? current : retained;
    });
  }, [itemsById]);

  function toggle(id: string) {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleMany(pageIds: string[]) {
    setIds(current => {
      const next = new Set(current);
      const remove = pageIds.every(id => current.has(id));
      for (const id of pageIds) { if (remove) next.delete(id); else next.add(id); }
      return next;
    });
  }

  function reset(nextEnabled = false) {
    setEnabled(nextEnabled);
    setIds((current) => current.size ? new Set() : current);
  }

  return { enabled, ids, toggle, toggleMany, reset, clear: () => setIds(new Set()) };
}
