import type { CSSProperties } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FolderOutput, Images, Maximize, Minimize, MoreVertical, Music, Play, RotateCcw, Shuffle } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { ActionMenu } from "../../components/ActionMenu";
import { albumLeafLayout, isPortraitMedia, mediaSummary } from "../media/journalModel";
import { useAlbumReader } from "./useAlbumReader";
import { ALBUM_TURN_TIMING } from "./albumAnimation";
import albumOpenBase from "../../assets/album-open-white-thin.png";

export function AlbumFullscreenReader({ title, items, color, open, onOpen, onClose, onExport, backLabel = "내 앨범" }: {
  title: string;
  items: MediaItem[];
  color?: string;
  open: boolean;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onClose: () => void;
  onExport?: () => void;
  backLabel?: string;
}) {
  const { order, orderedItems, pages, currentPage, visibleSpread, turning, turningLeaves, turnPhase, listView,
    fullscreen, notice, resetOrder, jumpToPage, turnPage, toggleFullscreen, toggleListView } = useAlbumReader(items, open, onClose);

  if (!open) return null;
  return <div className={`albumJournal${listView ? " is-list" : ""}`} style={{
    "--album-color": color,
    "--album-turn-duration": `${ALBUM_TURN_TIMING.motion}ms`,
    "--album-photo-reveal": `${ALBUM_TURN_TIMING.reveal}ms`,
    "--album-first-reveal-delay": `${ALBUM_TURN_TIMING.firstRevealDelay}ms`,
    "--album-opposite-reveal-start": `${ALBUM_TURN_TIMING.oppositeSwap}ms`,
    "--album-opposite-reveal": `${ALBUM_TURN_TIMING.oppositeReveal}ms`,
  } as CSSProperties} role="dialog" aria-modal="false" aria-label="앨범 전체창">
    <header className="albumJournalHeader">
      <button className="albumJournalBack" onClick={onClose} title="닫기"><ChevronLeft size={22} />{backLabel}</button>
      <div className="albumJournalHeading"><h2>{title}</h2><span>{mediaSummary(orderedItems)}{!listView && " · 세로 4장 / 가로 2장"}</span></div>
      <div className="albumJournalTools">
        <button aria-pressed={listView} onClick={toggleListView} aria-label={listView ? "책으로 보기" : "사진 목록"} title={listView ? "책으로 보기" : "사진 목록"}>{listView ? <BookOpen size={18} /> : <Images size={18} />}<span>{listView ? "책으로 보기" : "사진 목록"}</span></button>
        <button onClick={() => void toggleFullscreen()} disabled={!document.fullscreenEnabled} aria-pressed={fullscreen} title={fullscreen ? "전체화면 종료" : "전체화면"}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}<span>{fullscreen ? "전체화면 종료" : "전체화면"}</span></button>
        <ActionMenu label="앨범 보기 옵션" icon={<MoreVertical size={19} />} actions={[
          ...(onExport ? [{ label: "내보내기", icon: <FolderOutput size={16} />, disabled: !items.length, onSelect: onExport }] : []),
          { label: "사진 순서 섞기", icon: <Shuffle size={16} />, disabled: orderedItems.length < 2, onSelect: () => resetOrder(true) },
          { label: "원래 순서로 보기", icon: <RotateCcw size={16} />, disabled: !order, onSelect: () => resetOrder(false) },
        ]} />
      </div>
    </header>
    {notice && <p className="albumReaderNotice" role="status">{notice}</p>}
    {listView ? <section className="albumPhotoList" aria-label={`${title} 사진 목록`}>
      {!items.length && <EmptyState text="앨범에 담긴 기록이 없습니다." />}
      {orderedItems.map((item) => <button key={item.id} onClick={() => onOpen(item, orderedItems)} aria-label={`${item.fileName} 상세보기`}><MediaVisual item={item} />
        <strong className="albumPhotoName">{item.title?.trim() || item.fileName}</strong>
        <span>{item.takenAt ?? "날짜 없음"}{item.fileType === "video" && <Play size={14} />}{item.fileType === "audio" && <Music size={14} />}</span>
      </button>)}
    </section> : <div className="albumJournalCanvas">
      {!items.length ? <EmptyState text="앨범에 담긴 기록이 없습니다." /> : <div className="albumBookStage">
      <button className="albumEdgeNav prev" onClick={() => turnPage(-1)} disabled={Boolean(turning) || currentPage === 0} title="이전 책장"><ChevronLeft size={32} /></button>
      <div className={`albumSpread ${turning ? `turning-${turning}` : ""} ${turning && turnPhase ? `${turnPhase}-${turning}` : ""}`} data-turn-phase={turnPhase ?? undefined} aria-label="양면 포토앨범 책장" aria-busy={Boolean(turning)}>
        <div className="albumHardback">
          <img className="albumBookBase" src={albumOpenBase} alt="" aria-hidden="true" />
          {(["left", "right"] as const).map((side, sideIndex) => {
            const entries = visibleSpread?.[side] ?? [];
            const portrait = entries.length === 1 && isPortraitMedia(entries[0]);
            return <section key={side} className={`albumPaper ${side}${entries.length === 1 ? " single-photo" : ""}${portrait ? " portrait-photo" : ""}`}>
              <div className={`albumPageImages albumLeafLayout layout-${albumLeafLayout(entries)}`}>{entries.map((item, index) => <AlbumPagePhoto key={item.id} item={item} index={sideIndex * 4 + index} side={side} turning={Boolean(turning)} onOpen={() => onOpen(item, orderedItems)} />)}</div>
              <span className="albumPageNumber">{String(currentPage * 2 + sideIndex + 1).padStart(2, "0")}</span>
            </section>;
          })}
          {turning && turningLeaves && <div className={`albumTurnLayer ${turning}`} aria-hidden="true" inert>
            <span className="albumTurnShadow" />
            <div className="albumTurningSheet">
              <AlbumTurningFace face="front" side={turning === "next" ? "right" : "left"} items={turningLeaves.front} />
              <AlbumTurningFace face="back" side={turning === "next" ? "left" : "right"} items={turningLeaves.back} />
            </div>
          </div>}
        </div>
      </div>
      <button className="albumEdgeNav next" onClick={() => turnPage(1)} disabled={Boolean(turning) || currentPage >= pages.length - 1} title="다음 책장"><ChevronRight size={32} /></button>
      </div>}
    </div>}
    {!listView && <footer className="albumJournalPager">
      <div className="albumPagerActions">
        <button onClick={() => turnPage(-1)} disabled={Boolean(turning) || currentPage === 0}><ChevronLeft size={17} />이전</button>
        <p aria-live="polite">{pages.length ? currentPage + 1 : 0} / {pages.length} 펼침</p>
        <button onClick={() => turnPage(1)} disabled={Boolean(turning) || currentPage >= pages.length - 1}>다음<ChevronRight size={17} /></button>
      </div>
      <input className="albumProgress" type="range" aria-label="앨범 책장 이동" aria-valuetext={`${currentPage + 1} / ${pages.length} 펼침`} min={1} max={Math.max(1, pages.length)} value={currentPage + 1} disabled={pages.length < 2} onChange={(event) => jumpToPage(Number(event.target.value) - 1)} />
    </footer>}
  </div>;
}

function AlbumPagePhoto({ item, index, side, turning, onOpen }: { item: MediaItem; index: number; side: "left" | "right"; turning: boolean; onOpen: () => void }) {
  return <figure className="albumPhotoEntry" data-side={side}>
    <button data-slot={index} data-side={side} data-media-id={item.id} className="albumPagePhoto" disabled={turning} onClick={onOpen} aria-label={`${item.fileName} 상세보기`}>
      <AlbumPhotoVisual item={item} />
    </button>
    <AlbumPhotoCaption item={item} className="albumPageCaption" />
  </figure>;
}

function AlbumTurningFace({ face, side, items }: { face: "front" | "back"; side: "left" | "right"; items: MediaItem[] }) {
  return <div className={`albumTurnFace ${face} ${side}`}>
    <div className={`albumTurnImages albumLeafLayout layout-${albumLeafLayout(items)}`}>
      {items.map(item => <figure key={item.id} className="albumTurnPrint" data-turn-media-id={item.id}>
        <div className="albumTurnPhoto"><AlbumPhotoVisual item={item} /></div>
        <AlbumPhotoCaption item={item} className="albumTurnCaption" />
      </figure>)}
    </div>
  </div>;
}

function AlbumPhotoVisual({ item }: { item: MediaItem }) {
  return <MediaVisual item={item} original>
    {item.fileType === "video" && <span className="videoDuration"><Play size={12} fill="currentColor" />{item.duration || "영상"}</span>}
    {item.fileType === "audio" && <Music className="mediaBadge" size={28} />}
  </MediaVisual>;
}

function AlbumPhotoCaption({ item, className }: { item: MediaItem; className: string }) {
  const caption = item.title?.trim();
  const date = item.takenAt?.slice(0, 10);
  return caption || date ? <figcaption className={className}>
    {caption && <p title={caption}>{caption}</p>}
    {date && <time dateTime={date}>{date.replaceAll("-", ".")}</time>}
  </figcaption> : null;
}
