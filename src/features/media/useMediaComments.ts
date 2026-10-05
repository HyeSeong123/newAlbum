import { useMemo, useState } from "react";
import type { MediaItem } from "../../types/media";
import { getMediaComments, loadMediaComments } from "./mediaComments";

// Existing records remain available to the library's historical filters.
export function useMediaCommentCounts(items: MediaItem[]) {
  const [comments] = useState(loadMediaComments);
  return useMemo(() => Object.fromEntries(items.map(item => [item.id, getMediaComments(item, comments).length])), [items, comments]);
}
