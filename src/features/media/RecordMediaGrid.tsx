import { useState } from "react";
import { Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import "./record-media-grid.css";

export function RecordMediaGrid({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem, collection: MediaItem[]) => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / 48));
  const current = Math.min(page, pages - 1);
  return <>
    <div className="recordMediaGrid">
      {items.slice(current * 48, (current + 1) * 48).map(item => <button key={item.id} onClick={() => onOpen(item, items)} aria-label={`${item.title || item.fileName} 상세보기`}>
        <MediaVisual item={item}>{item.fileType === "video" && <Play size={28} />}{item.fileType === "audio" && <Music size={28} />}</MediaVisual>
        <strong>{item.title || item.fileName}</strong><time>{item.takenAt?.slice(0,10) || "날짜 없음"}</time>
      </button>)}
    </div>
    {pages > 1 && <nav className="recordGridPager" aria-label="기록 목록 페이지">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>이전 페이지</button><span>{current + 1} / {pages}</span><button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>다음 페이지</button>
    </nav>}
  </>;
}
