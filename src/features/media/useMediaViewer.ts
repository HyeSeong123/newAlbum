import { useMemo, useState } from "react";
import type { MediaItem } from "../../types/media";

export function useMediaViewer(itemsById: Map<string, MediaItem>, onView: (id: string) => void) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const selected = selectedId ? itemsById.get(selectedId) ?? null : null;
  const available = useMemo(() => ids.filter((id) => itemsById.has(id)), [ids, itemsById]);

  function open(item: MediaItem, collection: MediaItem[]) {
    setIds(collection.map((entry) => entry.id));
    setSelectedId(item.id); onView(item.id);
  }

  function move(direction: -1 | 1) {
    if (!selected || !available.length) return;
    const position = available.indexOf(selected.id);
    const id = available[(position + direction + available.length) % available.length];
    setSelectedId(id); onView(id);
  }

  return { selected, open, move, close: () => setSelectedId(null) };
}
