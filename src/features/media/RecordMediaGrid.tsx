import { useState } from "react";
import { Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import { locationStatusText } from "../map/locationStatus";
import "./record-media-grid.css";

export function RecordMediaGrid({ items, onOpen, selectedIds, onToggle, showLocationStatus = false }: { items: MediaItem[]; onOpen: (item: MediaItem, collection: MediaItem[]) => void; selectedIds?: ReadonlySet<string>; onToggle?: (id: string) => void; showLocationStatus?: boolean }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / 48));
  const current = Math.min(page, pages - 1);
  return <>
    <div className="recordMediaGrid">
      {items.slice(current * 48, (current + 1) * 48).map(item => <button key={item.id} onClick={() => onToggle ? onToggle(item.id) : onOpen(item, items)} aria-pressed={onToggle ? selectedIds?.has(item.id) ?? false : undefined} aria-label={`${item.title || item.fileName} ${onToggle ? "선택" : "상세보기"}`}>
        <MediaVisual item={item}>{item.fileType === "video" && <Play size={28} />}{item.fileType === "audio" && <Music size={28} />}</MediaVisual>
        <strong>{item.title || item.fileName}</strong><time>{item.takenAt?.slice(0,10) || "날짜 없음"}</time>
        {showLocationStatus && locationStatusText(item.locationStatus) && <span className="recordLocationStatus" data-location-status={item.locationStatus}>{locationStatusText(item.locationStatus)}</span>}
        {onToggle && <span className="recordSelectionMark">{selectedIds?.has(item.id) ? "✓ 선택됨" : "선택"}</span>}
      </button>)}
    </div>
    {pages > 1 && <nav className="recordGridPager" aria-label="기록 목록 페이지">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>이전 페이지</button><span>{current + 1} / {pages}</span><button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>다음 페이지</button>
    </nav>}
  </>;
}
