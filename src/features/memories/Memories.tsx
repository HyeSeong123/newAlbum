import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Images, Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { AlbumFullscreenReader } from "../albums/AlbumReader";
import { formatMediaCount } from "../calendar/calendarModel";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { MEMORY_TYPES, memoryGroups, type MemoryType } from "./memoriesModel";
import "./memories.css";

export function Memories({ items, today, onOpen, onShowLibrary }: { items: MediaItem[]; today: string; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; onShowLibrary: () => void }) {
  const [type, setType] = useState<MemoryType>("today");
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const groups = useMemo(() => memoryGroups(items, today, type), [items, today, type]);
  const group = groups.find(entry => entry.id === selected);
  return <div className="memories">
    <div className="memoryPeriod" role="group" aria-label="추억 기간">
      {(Object.keys(MEMORY_TYPES) as MemoryType[]).map(key => <button key={key} aria-pressed={type === key} onClick={() => { setType(key); setSelected(null); setReading(false); }}>{MEMORY_TYPES[key].label}</button>)}
    </div>
    {group ? <section aria-label={group.title}>
      <header className="memoryDetailHeader"><button onClick={() => { setSelected(null); setReading(false); }}><ChevronLeft size={16} />추억 목록</button>
        <div><h2>{group.title}</h2><p>{group.dateLabel} · {formatMediaCount(group.items)}</p></div>
        <button onClick={() => setReading(true)}><BookOpen size={17} />함께 감상</button>
      </header>
      <RecordMediaGrid key={group.id} items={group.items} onOpen={onOpen} />
      {reading && <AlbumFullscreenReader title={`${group.dateLabel}의 추억`} items={group.items} open onOpen={onOpen} onClose={() => setReading(false)} backLabel="추억" />}
    </section> : <>
      <h2>{MEMORY_TYPES[type].label}</h2>
      {!groups.length && <EmptyState title="아직 다시 보여드릴 추억이 없습니다." description="사진 기록이 쌓이면 예전 오늘이나 같은 달의 사진을 다시 보여드립니다." actionLabel="사진 기록 보기" actionIcon={<Images size={18} />} onAction={onShowLibrary} />}
      <div className="memoryGroups">{groups.map(entry => {
        const cover = entry.items.find(item => item.fileType === "image") ?? entry.items[0];
        return <button className="memoryGroupCard" key={entry.id} onClick={() => setSelected(entry.id)} aria-label={`${entry.title} · ${entry.dateLabel} · ${formatMediaCount(entry.items)}`}>
          <MediaVisual item={cover}>{cover.fileType === "video" && <Play size={32} />}{cover.fileType === "audio" && <Music size={32} />}</MediaVisual>
          <div><strong>{entry.title}</strong><time>{entry.dateLabel}</time><span>{formatMediaCount(entry.items)}</span><p>{cover.title || cover.comment || "다시 펼쳐보는 우리의 기록"}</p></div>
        </button>;
      })}</div>
    </>}
  </div>;
}
