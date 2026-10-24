import { useEffect, useMemo, useState } from "react";
import { useDetailListNavigation } from '../../hooks/useDetailListNavigation';
import { BookOpen, ChevronLeft, Images, Music, Play } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { AlbumFullscreenReader } from "../albums/AlbumReader";
import { formatMediaCount } from "../calendar/calendarModel";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { MEMORY_TYPES, memoryGroups, type MemoryType } from "./memoriesModel";
import "./memories.css";

export function Memories({ items, today, query = "", onDetailChange, onOpen, onShowLibrary }: { items: MediaItem[]; today: string; query?: string; onDetailChange?: (active: boolean) => void; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; onShowLibrary: () => void }) {
  const [type, setType] = useState<MemoryType>("today");
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const groups = useMemo(() => memoryGroups(items, today, type), [items, today, type]);
  const group = groups.find(entry => entry.id === selected);
  useEffect(() => { onDetailChange?.(Boolean(group)); }, [Boolean(group), onDetailChange]);
  const navigation = useDetailListNavigation(group?.id, () => { setSelected(null); setReading(false); }, !reading);
  return <div className="memories">
    <div className="memoryPeriod" role="group" aria-label="추억 기간">
      {(Object.keys(MEMORY_TYPES) as MemoryType[]).map(key => <button key={key} aria-pressed={type === key} onClick={() => { setType(key); setSelected(null); setReading(false); }}>{MEMORY_TYPES[key].label}</button>)}
    </div>
    {group ? <section aria-label={group.title}>
      <header className="memoryDetailHeader"><button onClick={navigation.close}><ChevronLeft size={16} />그날 목록</button>
        <div><h2 ref={navigation.heading} tabIndex={-1}>{group.title}</h2><p>{group.dateLabel} · {formatMediaCount(group.items)}</p></div>
        <button className="memoryPrimaryAction" onClick={() => setReading(true)}><BookOpen size={17} />추억책 펼치기</button>
      </header>
      <RecordMediaGrid key={group.id} items={group.items} onOpen={onOpen} />
      {reading && <AlbumFullscreenReader title={`${group.dateLabel}의 추억`} items={group.items} open onOpen={onOpen} onClose={() => setReading(false)} backLabel="추억" />}
    </section> : <>
      <h2 className="memorySectionHeading">{type === 'today' ? '오늘, 다시 만난 그날' : '이 달에 머문 추억'}</h2>
      {!groups.length && <EmptyState title={query.trim() ? "이 말에 닿는 추억이 아직 없어요" : "아직, 이곳은 빈 페이지예요"} description={query.trim() ? "다른 단어로 찾아보거나 모든 추억을 다시 펼쳐보세요." : MEMORY_TYPES[type].empty} actionLabel={query.trim() ? undefined : "내 사진 펼치기"} actionIcon={<Images size={18} />} onAction={onShowLibrary} />}
      <div className="memoryGroups">{groups.map(entry => {
        const cover = entry.items.find(item => item.fileType === "image") ?? entry.items[0];
        return <button ref={navigation.bindControl(entry.id)} className="memoryGroupCard" key={entry.id} onClick={() => { navigation.remember(); setSelected(entry.id); }} aria-label={`${entry.title} · ${entry.dateLabel} · ${formatMediaCount(entry.items)}`}>
          <MediaVisual item={cover}>{cover.fileType === "video" && <Play size={32} />}{cover.fileType === "audio" && <Music size={32} />}</MediaVisual>
          <div><strong>{entry.title}</strong><time>{entry.dateLabel}</time><span>{formatMediaCount(entry.items)}</span><p>{cover.title || cover.comment || "다시 펼쳐보는 우리의 기록"}</p></div>
        </button>;
      })}</div>
    </>}
  </div>;
}
