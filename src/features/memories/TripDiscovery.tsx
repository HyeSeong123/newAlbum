import { useEffect, useMemo, useState } from "react";
import { BookPlus, ChevronLeft, Images, Play } from "lucide-react";
import { useDetailListNavigation } from '../../hooks/useDetailListNavigation';
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { discoverTrips } from "./tripModel";
import "./trip-discovery.css";

const CARD_PAGE_SIZE = 12;

export function TripDiscovery({ items, visibleItems, onDetailChange, onOpen, onCreateAlbum }: {
  items: MediaItem[]; onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  visibleItems?: MediaItem[]; onDetailChange?: (active: boolean) => void;
  onCreateAlbum: (items: MediaItem[], title?: string) => void;
}) {
  const trips = useMemo(() => discoverTrips(items, visibleItems ? new Set(visibleItems.map(item => item.id)) : undefined), [items, visibleItems]);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(trips.length / CARD_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const trip = trips.find(entry => entry.id === selected);
  useEffect(() => { onDetailChange?.(Boolean(trip)); }, [Boolean(trip), onDetailChange]);
  const navigation = useDetailListNavigation(trip?.id, () => setSelected(null));
  if (!trips.length) return null;
  return <section className="tripDiscovery" aria-label="여행 후보">
    <header><div><h2>함께 걸었던 여행</h2></div></header>
    {trip ? <section aria-label="여행 기록 목록">
      <div className="tripDetailHeader"><button onClick={navigation.close}><ChevronLeft size={17} />여행 목록</button><div><h3 ref={navigation.heading} tabIndex={-1}>{trip.title}</h3>
        <p>{trip.start} ~ {trip.end} · {trip.regionName}</p><p>사진 {trip.photos}장 · 영상 {trip.videos}개</p></div>
        <button className="memoryPrimaryAction" onClick={() => onCreateAlbum(trip.items, trip.albumTitle)}><BookPlus size={17} />여행 앨범 만들기</button></div>
      <RecordMediaGrid key={trip.id} items={trip.items} onOpen={onOpen} />
    </section> : <>
      <div className="tripCards">{trips.slice(current * CARD_PAGE_SIZE, (current + 1) * CARD_PAGE_SIZE).map(entry => <article className="tripCard" key={entry.id} aria-label={entry.title}>
        <MediaVisual item={entry.cover}>{entry.cover.fileType === "video" && <Play size={32} />}</MediaVisual>
        <div><h3>{entry.title}</h3><p>{entry.start} ~ {entry.end}</p><p>{entry.regionName}</p><p>사진 {entry.photos}장 · 영상 {entry.videos}개</p>
          <div className="tripActions"><button ref={navigation.bindControl(entry.id)} onClick={() => { navigation.remember(); setSelected(entry.id); }}><Images size={17} />여행 펼치기</button><button className="memoryPrimaryAction" onClick={() => onCreateAlbum(entry.items, entry.albumTitle)}><BookPlus size={17} />여행 앨범 만들기</button></div>
        </div>
      </article>)}</div>
      {pages > 1 && <nav className="recordGridPager" aria-label="여행 후보 페이지"><button disabled={current === 0} onClick={() => setPage(current - 1)}>이전</button>
        <span>{current + 1} / {pages}</span><button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>다음</button></nav>}
    </>}
  </section>;
}
