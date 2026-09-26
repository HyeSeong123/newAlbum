import { useMemo, useRef, useState } from "react";
import type { MediaItem } from "../../types/media";
import { getMediaComments, loadMediaComments, replaceMediaComments, saveMediaComments, type MediaComment } from "./mediaComments";

export function useMediaComments(items: MediaItem[], update: (id: string, patch: Partial<MediaItem>) => void) {
  const [comments, setComments] = useState(loadMediaComments);
  const current = useRef(comments);
  const [error, setError] = useState("");
  const counts = useMemo(() => Object.fromEntries(items.map((item) => [item.id, getMediaComments(item, comments).length])), [items, comments]);

  function commit(item: MediaItem, entries: MediaComment[]) {
    const next = replaceMediaComments(current.current, item.id, entries);
    if (!saveMediaComments(next)) {
      setError("댓글을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.");
      return false;
    }
    current.current = next;
    setComments(next);
    setError("");
    update(item.id, { comment: entries.at(-1)?.content ?? "" });
    return true;
  }

  function add(item: MediaItem, author: string, content: string) {
    return commit(item, [...(current.current[item.id] ?? []), {
      id: `comment-${crypto.randomUUID()}`, author, content, createdAt: new Date().toISOString(),
    }]);
  }

  function edit(item: MediaItem, id: string, author: string, content: string) {
    return commit(item, getMediaComments(item, current.current).map((entry) => entry.id === id ? { ...entry, author, content } : entry));
  }

  function remove(item: MediaItem, id: string) {
    return commit(item, getMediaComments(item, current.current).filter((entry) => entry.id !== id));
  }

  return { comments, counts, error, add, edit, remove };
}
