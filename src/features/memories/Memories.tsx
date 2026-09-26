import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";

export function Memories({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  return (
    <div className="memories">
      <h2>몇 년 전 오늘</h2>
      {!items.length && <EmptyState text="오늘과 같은 날짜의 예전 기록이 아직 없습니다." />}
      <div className="memoryGrid">
        {items.map((item) => (
          <button key={item.id} onClick={() => onOpen(item)}>
            <MediaVisual item={item} />
            <strong>{item.takenAt?.slice(0, 4)}</strong>
            <span>{item.comment || "추억 기록"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

