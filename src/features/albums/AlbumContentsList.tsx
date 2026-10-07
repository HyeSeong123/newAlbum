import { useMemo, useState } from "react";
import { Music, Play } from "lucide-react";
import type { AlbumContent, MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { AlbumWrittenPage } from "./chapter/AlbumWrittenPage";
import { albumListContents } from "./albumContent";
import "./album-contents-list.css";

export function AlbumContentsList({ title, items, contents, onOpen }: {
  title: string; items: MediaItem[]; contents?: AlbumContent[];
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
}) {
  const [diariesOnly, setDiariesOnly] = useState(false);
  const entries = useMemo(() => albumListContents(items, contents), [items, contents]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const diaries = useMemo(() => entries.filter(entry => entry.kind === "TEXT"), [entries]);
  const visible = diariesOnly ? diaries : entries;
  return <div className="albumContentsList">
    <div className="albumListFilters" role="group" aria-label="앨범 목록 필터">
      <button aria-pressed={!diariesOnly} onClick={() => setDiariesOnly(false)}>전체 <span>{entries.length}</span></button>
      <button aria-pressed={diariesOnly} onClick={() => setDiariesOnly(true)}>글·일기만 <span>{diaries.length}</span></button>
      <span className="albumListCount" role="status">{diariesOnly ? `글·일기 ${diaries.length}편` : `${entries.length}개의 기록`}</span>
    </div>
    <section className={`albumPhotoList${diariesOnly ? " diaries-only" : ""}`} aria-label={`${title} ${diariesOnly ? "일기 목록" : "사진 목록"}`}>
      {!visible.length && <EmptyState text={diariesOnly ? "아직 작성된 글이 없어요. 앨범에서 편지을 추가해 보세요." : "앨범에 담긴 기록이 없습니다."} />}
      {visible.map(entry => {
        if (entry.kind === "TEXT" || entry.kind === "CHAPTER") return <div key={entry.id} className="albumListWritten"><AlbumWrittenPage page={entry} /></div>;
        const item = byId.get(entry.mediaId ?? "");
        return item ? <button key={entry.id} onClick={() => onOpen(item, items)} aria-label={`${item.fileName} 상세보기`}><MediaVisual item={item} />
          <strong className="albumPhotoName">{item.title?.trim() || item.fileName}</strong>
          <span>{item.takenAt ?? "날짜 없음"}{item.fileType === "video" && <Play size={14} />}{item.fileType === "audio" && <Music size={14} />}</span>
        </button> : null;
      })}
    </section>
  </div>;
}
