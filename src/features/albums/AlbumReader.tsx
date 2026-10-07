import { type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FolderOutput, Maximize, Minimize, MoreVertical, Music, Pencil, Play } from "lucide-react";
import type { AlbumContent, MediaItem } from "../../types/media";
import { AlbumWrittenPage } from "./chapter/AlbumWrittenPage";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { ActionMenu } from "../../components/ActionMenu";
import { albumLeafLayout, isLandscapeMedia, isPortraitMedia, mediaSummary } from "../media/journalModel";
import { useAlbumReader } from "./useAlbumReader";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { ALBUM_TURN_TIMING } from "./albumAnimation";
import albumOpenBase from "../../assets/album-open-white-thin.png";
import { DEFAULT_ALBUM_COLOR } from "./AlbumCover";

export function AlbumFullscreenReader({ title, items, contents, color, open, onOpen, onClose, onExport, onEdit, onAddWritten, onEditWritten, canEditWritten, backLabel = "내 앨범" }: {
  title: string;
  items: MediaItem[];
  contents?: AlbumContent[];
  color?: string;
  open: boolean;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onClose: () => void;
  onExport?: () => void;
  onEdit?: () => void;
  onAddWritten?: (kind: "CHAPTER" | "TEXT", afterId?: string) => void;
  onEditWritten?: (entry: AlbumContent) => void;
  canEditWritten?: (entry: AlbumContent) => boolean;
  backLabel?: string;
}) {
  const diaryCount = contents?.filter(entry => entry.kind === "TEXT").length ?? 0;
  const chapterCount = contents?.filter(entry => entry.kind === "CHAPTER").length ?? 0;
  const mobile = useMobileLayout();
  const { orderedItems, pages, currentPage, singlePage, visibleSpread, turning, turningLeaves, turnPhase,
    fullscreen, notice, dragOffset, swipeHandlers, jumpToPage, turnPage, toggleFullscreen } = useAlbumReader(items, open, onClose, contents);

  if (!open) return null;
  const pageUnit = singlePage ? "페이지" : "펼침";
  return <div className={`albumJournal${singlePage ? " is-single-page" : ""}`} style={{
    "--album-color": color ?? DEFAULT_ALBUM_COLOR,
    "--album-turn-duration": `${ALBUM_TURN_TIMING.motion}ms`,
    "--album-photo-reveal": `${ALBUM_TURN_TIMING.reveal}ms`,
    "--album-first-reveal-delay": `${ALBUM_TURN_TIMING.firstRevealDelay}ms`,
    "--album-opposite-reveal-start": `${ALBUM_TURN_TIMING.oppositeSwap}ms`,
    "--album-opposite-reveal": `${ALBUM_TURN_TIMING.oppositeReveal}ms`,
  } as CSSProperties} role="dialog" aria-modal="false" aria-label="앨범 전체창">
    <header className="albumJournalHeader">
      <div className="albumJournalStart"><button className="albumJournalBack" onClick={onClose} title="닫기"><ChevronLeft size={22} />{backLabel}</button>
      </div>
      <div className="albumJournalHeading"><h2>{title}</h2><span>{[
        orderedItems.length ? mediaSummary(orderedItems) : "", diaryCount ? `편지 ${diaryCount}편` : "", chapterCount ? `챕터 ${chapterCount}개` : "",
      ].filter(Boolean).join(" · ") || "기록 없음"}{!singlePage && orderedItems.length > 0 && " · 세로 4장 / 가로 2장"}</span></div>
      <div className="albumJournalTools">
        {!singlePage && onEdit && <button className="albumJournalEdit" onClick={onEdit} aria-label="앨범 수정" title="앨범 수정"><Pencil size={18} /><span>앨범 수정</span></button>}
        {!mobile && !singlePage && <button onClick={() => void toggleFullscreen()} disabled={!document.fullscreenEnabled} aria-pressed={fullscreen} title={fullscreen ? "전체화면 종료" : "전체화면"}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}<span>{fullscreen ? "전체화면 종료" : "전체화면"}</span></button>}
        {(onExport || (singlePage && onEdit) || (!mobile && singlePage)) && <ActionMenu label="앨범 보기 옵션" triggerText="더 보기" icon={<MoreVertical size={18} />} actions={[
          ...(singlePage && onEdit ? [{ label: "앨범 수정", icon: <Pencil size={16} />, onSelect: onEdit }] : []),
          ...(onExport ? [{ label: "내보내기", icon: <FolderOutput size={16} />, disabled: !items.length, onSelect: onExport }] : []),
          ...(!mobile && singlePage ? [{ label: fullscreen ? "전체화면 종료" : "전체화면", icon: <Maximize size={16} />, disabled: !document.fullscreenEnabled, onSelect: () => void toggleFullscreen() }] : []),
        ]} />}
      </div>
    </header>
    {notice && <p className="albumReaderNotice" role="status">{notice}</p>}
    <div className={`albumJournalCanvas${onAddWritten ? " has-writing-actions" : ""}`}>
      {onAddWritten && <div className="albumJournalAdd">{(["CHAPTER", "TEXT"] as const).map(kind => <button key={kind} disabled={Boolean(turning)} onClick={() => {
        const spread = pages[currentPage];
        const written = spread?.rightPage ?? (!spread?.right.length ? spread?.leftPage : undefined);
        const lastMedia = spread?.right.at(-1) ?? spread?.left.at(-1);
        const anchor = written?.id ?? contents?.find(entry => entry.mediaId === lastMedia?.id)?.id;
        onAddWritten(kind, anchor);
      }}>{kind === "CHAPTER" ? "챕터+" : "편지+"}</button>)}</div>}
      {!pages.length ? <EmptyState text="앨범에 담긴 기록이 없습니다." /> : <div className="albumBookStage">
      <button className="albumEdgeNav prev" onClick={() => turnPage(-1)} disabled={Boolean(turning) || currentPage === 0} title="이전 책장"><ChevronLeft size={32} /></button>
      <div className={`albumSpread ${turning ? `turning-${turning}` : ""} ${turning && turnPhase ? `${turnPhase}-${turning}` : ""}`} data-turn-phase={turnPhase ?? undefined} aria-label={singlePage ? "한 페이지 포토앨범 책장" : "양면 포토앨범 책장"} aria-busy={Boolean(turning)} {...swipeHandlers} style={dragOffset ? { transform: `translateX(${dragOffset}px)` } : undefined} data-dragging={dragOffset !== 0}>
        <div className="albumHardback">
          <img className="albumBookBase" src={albumOpenBase} alt="" aria-hidden="true" />
          <span className="albumBookTrim" aria-hidden="true" />
          {(singlePage ? ["left"] as const : ["left", "right"] as const).map((side, sideIndex) => {
            const entries = visibleSpread?.[side] ?? [];
            const written = visibleSpread?.[`${side}Page`];
            const portrait = entries.length === 1 && isPortraitMedia(entries[0]);
            const landscape = entries.length > 0 && entries.every(isLandscapeMedia);
            return <section key={side} className={`albumPaper ${side}${entries.length === 1 ? " single-photo" : ""}${portrait ? " portrait-photo" : ""}${landscape ? " landscape-page" : ""}`}>
              {written ? <div className="albumPhotoEntry" data-side={side}><AlbumWrittenPage page={written} onEdit={onEditWritten && (!canEditWritten || canEditWritten(written)) && !turning ? () => onEditWritten(written) : undefined} /></div> : <div className={`albumPageImages albumLeafLayout layout-${albumLeafLayout(entries)}`}>{entries.map((item, index) => <AlbumPagePhoto key={item.id} item={item} index={sideIndex * 4 + index} side={side} turning={Boolean(turning)} onOpen={() => onOpen(item, orderedItems)} />)}</div>}
              <span className="albumPageNumber">{String(currentPage * (singlePage ? 1 : 2) + sideIndex + 1).padStart(2, "0")}</span>
            </section>;
          })}
          {turning && turningLeaves && <div className={`albumTurnLayer ${turning}`} aria-hidden="true" inert>
            <span className="albumTurnShadow" />
            <div className="albumTurningSheet">
              <AlbumTurningFace face="front" side={singlePage || turning === "prev" ? "left" : "right"} items={turningLeaves.front} page={turningLeaves.frontPage} />
              <AlbumTurningFace face="back" side={singlePage || turning === "next" ? "left" : "right"} items={turningLeaves.back} page={turningLeaves.backPage} />
            </div>
          </div>}
        </div>
      </div>
      <button className="albumEdgeNav next" onClick={() => turnPage(1)} disabled={Boolean(turning) || currentPage >= pages.length - 1} title="다음 책장"><ChevronRight size={32} /></button>
      </div>}
    </div>
    <footer className="albumJournalPager">
      <div className="albumPagerActions">
        <button onClick={() => turnPage(-1)} disabled={Boolean(turning) || currentPage === 0}><ChevronLeft size={17} />이전</button>
        <p aria-live="polite">{pages.length ? currentPage + 1 : 0} / {pages.length} {pageUnit}</p>
        <button onClick={() => turnPage(1)} disabled={Boolean(turning) || currentPage >= pages.length - 1}>다음<ChevronRight size={17} /></button>
      </div>
      <input className="albumProgress" type="range" aria-label="앨범 책장 이동" aria-valuetext={`${pages.length ? currentPage + 1 : 0} / ${pages.length} ${pageUnit}`} min={1} max={Math.max(1, pages.length)} value={currentPage + 1} disabled={pages.length < 2} onChange={(event) => jumpToPage(Number(event.target.value) - 1)} />
    </footer>
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

function AlbumTurningFace({ face, side, items, page }: { face: "front" | "back"; side: "left" | "right"; items: MediaItem[]; page?: AlbumContent }) {
  return <div className={`albumTurnFace ${face} ${side}${items.length > 0 && items.every(isLandscapeMedia) ? " landscape-page" : ""}`}>
    {page ? <div className="albumTurnImages albumLeafLayout layout-single"><AlbumWrittenPage page={page} /></div> :
    <div className={`albumTurnImages albumLeafLayout layout-${albumLeafLayout(items)}`}>
      {items.map(item => <figure key={item.id} className="albumTurnPrint" data-turn-media-id={item.id}>
        <div className="albumTurnPhoto"><AlbumPhotoVisual item={item} /></div>
        <AlbumPhotoCaption item={item} className="albumTurnCaption" />
      </figure>)}
    </div>}
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
