import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BookOpen, Check, CheckSquare, ChevronLeft, ChevronRight, FolderOutput, Images, Maximize, Minimize, MoreVertical, Music, Pencil, Play, RotateCcw, Shuffle, Trash2, X } from "lucide-react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { AlbumColorPicker, AlbumCover } from "./AlbumCover";
import { ActionMenu } from "../../components/ActionMenu";
import { ExportModal } from "../../components/ExportModal";
import { isPortraitMedia, makeAlbumSpreads, mediaSummary, shuffleAlbumItems } from "../media/journalModel";
import albumOpenBase from "../../assets/album-open-white-thin.png";

export function SavedAlbumsView({
  albums,
  onOpen,
  onSave,
  onDelete,
  query = "",
}: {
  albums: SavedAlbum[];
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onSave: (album: SavedAlbum) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  query?: string;
}) {
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const activeAlbum = albums.find((album) => album.id === activeAlbumId);
  const [editing, setEditing] = useState<SavedAlbum | null>(null);
  const [exporting, setExporting] = useState<SavedAlbum | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"recent" | "old" | "name">("recent");
  const visibleAlbums = useMemo(() => albums.filter((album) => album.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title, "ko");
    return sort === "recent" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt);
  }), [albums, query, sort]);

  async function removeSelected() {
    if (!window.confirm(`선택한 앨범 ${chosen.length}개를 삭제할까요? 원본 사진은 유지됩니다.`)) return;
    setBusy(true);
    setError("");
    try { await onDelete(chosen); setChosen([]); setSelecting(false); }
    catch { setError("앨범을 삭제하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  return (
    <div className="savedAlbums">
      <div className="panelHeader">
        <label className="albumSort"><select aria-label="앨범 정렬" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">최근 만든 순</option><option value="old">오래된 순</option><option value="name">이름순</option></select></label>
        <div className="albumActions">
          <button disabled={busy} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setChosen([]); }}>
            {selecting ? <X size={17} /> : <CheckSquare size={17} />}{selecting ? "선택 끝내기" : "선택"}
          </button>
          {selecting && <>
            <button disabled={chosen.length !== 1 || busy} onClick={() => setEditing(albums.find((album) => album.id === chosen[0]) ?? null)}><Pencil size={17} />수정</button>
            <button disabled={!chosen.length || busy} onClick={() => void removeSelected()}><Trash2 size={17} />삭제</button>
          </>}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!albums.length && <EmptyState text="아직 만든 앨범이 없습니다. 새 앨범을 눌러 함께 담을 사진을 골라보세요." />}
      {albums.length > 0 && !visibleAlbums.length && <EmptyState text="검색한 이름의 앨범이 없습니다." />}
      <div className="savedAlbumGrid">
        {visibleAlbums.map((album) => {
          return (
          <article key={album.id} className="savedAlbumCard">
            <div className="savedAlbumCover">
            <button className="savedAlbumOpen" disabled={busy} aria-pressed={selecting ? chosen.includes(album.id) : undefined} onClick={() => selecting ? setChosen((current) => current.includes(album.id) ? current.filter((id) => id !== album.id) : [...current, album.id]) : setActiveAlbumId(album.id)} aria-label={`${album.title} 앨범 ${selecting ? "선택" : "열기"}`}>
              {selecting && <span className={`albumSelectionMark ${chosen.includes(album.id) ? "checked" : ""}`}>{chosen.includes(album.id) && <Check size={22} strokeWidth={3} />}</span>}
              <AlbumCover title={album.title} items={album.items} color={album.coverColor} />
            </button>
              {!selecting && <ActionMenu label={`${album.title} 앨범 메뉴`} icon={<MoreVertical size={18} />} disabled={busy} actions={[
                { label: "앨범 열기", icon: <BookOpen size={16} />, onSelect: () => setActiveAlbumId(album.id) },
                { label: "앨범 수정", icon: <Pencil size={16} />, onSelect: () => setEditing(album) },
                { label: "내보내기", icon: <FolderOutput size={16} />, disabled: !album.items.length, onSelect: () => setExporting(album) },
              ]} />}
            </div>
            <div className="savedAlbumMeta"><span>{mediaSummary(album.items)}</span></div>
          </article>
          );
        })}
      </div>
      {activeAlbum && (
        <AlbumFullscreenReader
          title={activeAlbum.title}
          items={activeAlbum.items}
          color={activeAlbum.coverColor}
          open={true}
          onOpen={onOpen}
          onClose={() => setActiveAlbumId(null)}
          onExport={() => setExporting(activeAlbum)}
        />
      )}
      {editing && <AlbumEditor album={editing} onClose={() => setEditing(null)} onSave={onSave} />}
      {exporting && <ExportModal title={exporting.title} items={exporting.items} onClose={() => setExporting(null)} />}
    </div>
  );
}

function AlbumEditor({ album, onClose, onSave }: { album: SavedAlbum; onClose: () => void; onSave: (album: SavedAlbum) => Promise<void> }) {
  const [draft, setDraft] = useState(album);
  const [chosen, setChosen] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pageCount = Math.max(1, Math.ceil(draft.items.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  useModalBehavior(() => { if (!busy) onClose(); });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await onSave({ ...draft, title: draft.title.trim() }); onClose(); }
    catch { setError("앨범을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="modalBackdrop">
    <section className="albumEditor" role="dialog" aria-modal="true" aria-labelledby="albumEditorTitle">
      <div className="detailHeader"><strong id="albumEditorTitle">앨범 수정</strong><button className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <label className="albumTitleField">제목<input required maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <AlbumColorPicker value={draft.coverColor} onChange={(coverColor) => setDraft({ ...draft, coverColor })} items={draft.items} title={draft.title} />
          <div className="albumActions"><strong>사진 {draft.items.length}장</strong><button type="button" disabled={!chosen.length} onClick={() => { setDraft({ ...draft, items: draft.items.filter((item) => !chosen.includes(item.id)) }); setChosen([]); }}><Trash2 size={17} />앨범에서 삭제{chosen.length > 0 ? ` (${chosen.length})` : ""}</button></div>
          <div className="albumEditPhotos">{draft.items.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} aria-label={`${item.takenAt ?? "날짜 없음"} 사진 선택`} aria-pressed={chosen.includes(item.id)} onClick={() => setChosen((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
            <MediaVisual item={item} /><span className={`albumSelectionMark ${chosen.includes(item.id) ? "checked" : ""}`}>{chosen.includes(item.id) && <Check size={22} strokeWidth={3} />}</span>
          </button>)}</div>
          {!draft.items.length && <p>앨범에 사진이 없습니다.</p>}
          {pageCount > 1 && <div className="albumActions"><button type="button" title="이전 페이지" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pageCount}</span><button type="button" title="다음 페이지" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
          {error && <p role="alert">{error}</p>}
          <div className="albumActions"><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={!draft.title.trim()}><Check size={18} />{busy ? "저장 중" : "저장"}</button></div>
        </fieldset>
      </form>
    </section>
  </div>;
}

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
  const [order, setOrder] = useState<string[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const [turnPhase, setTurnPhase] = useState<"departing" | "arriving" | null>(null);
  const [listView, setListView] = useState(true);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [notice, setNotice] = useState("");
  const timers = useRef<number[]>([]);
  const turnLock = useRef(false);
  const ownsFullscreen = useRef(false);
  const mediaOrderKey = items.map((item) => item.id).join("|");
  const orderedItems = useMemo(() => {
    if (!order) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    return order.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  }, [items, order]);
  const pages = useMemo(() => makeAlbumSpreads(orderedItems), [orderedItems]);
  const currentPage = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const visibleSpread = pages[currentPage];

  function cancelTurn() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    turnLock.current = false;
  }

  useEffect(() => {
    cancelTurn(); setOrder(null); setPageIndex(0); setTurning(null); setTurnPhase(null);
    return cancelTurn;
  }, [mediaOrderKey]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useModalBehavior(onClose, { enabled: open, onPrev: () => { if (!listView) turnPage(-1); }, onNext: () => { if (!listView) turnPage(1); } });

  function resetOrder(shuffle: boolean) {
    cancelTurn(); setTurning(null); setTurnPhase(null); setPageIndex(0);
    setOrder(shuffle ? shuffleAlbumItems(items).map((item) => item.id) : null);
  }

  function jumpToPage(next: number) {
    cancelTurn(); setTurning(null); setTurnPhase(null);
    setPageIndex(Math.min(Math.max(next, 0), Math.max(0, pages.length - 1)));
  }

  function turnPage(direction: -1 | 1) {
    if (turnLock.current || !pages.length) return;
    const nextIndex = Math.min(Math.max(currentPage + direction, 0), pages.length - 1);
    if (nextIndex === currentPage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { jumpToPage(nextIndex); return; }
    turnLock.current = true;
    setTurning(direction > 0 ? "next" : "prev"); setTurnPhase("departing");
    timers.current.push(window.setTimeout(() => { setTurnPhase("arriving"); setPageIndex(nextIndex); }, 230));
    timers.current.push(window.setTimeout(() => { setTurnPhase(null); setTurning(null); cancelTurn(); }, 620));
  }

  async function toggleFullscreen() {
    setNotice("");
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); ownsFullscreen.current = false; }
      else { await document.documentElement.requestFullscreen(); ownsFullscreen.current = true; }
    } catch { setNotice("전체화면으로 전환하지 못했습니다. 창 크기를 늘려서 볼 수 있어요."); }
  }

  if (!open) return null;
  return <div className={`albumJournal${listView ? " is-list" : ""}`} style={{ "--album-color": color } as CSSProperties} role="dialog" aria-modal="false" aria-label="앨범 전체창">
    <header className="albumJournalHeader">
      <button className="albumJournalBack" onClick={onClose} title="닫기"><ChevronLeft size={22} />{backLabel}</button>
      <div className="albumJournalHeading"><h2>{title}</h2><span>{mediaSummary(items)}</span></div>
      <div className="albumJournalTools">
        <button aria-pressed={listView} onClick={() => { cancelTurn(); setTurning(null); setTurnPhase(null); setListView(!listView); }} aria-label={listView ? "책으로 보기" : "사진 목록"} title={listView ? "책으로 보기" : "사진 목록"}>{listView ? <BookOpen size={18} /> : <Images size={18} />}<span>{listView ? "책으로 보기" : "사진 목록"}</span></button>
        <button onClick={() => void toggleFullscreen()} disabled={!document.fullscreenEnabled} aria-pressed={fullscreen} title={fullscreen ? "전체화면 종료" : "전체화면"}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}<span>{fullscreen ? "전체화면 종료" : "전체화면"}</span></button>
        <ActionMenu label="앨범 보기 옵션" icon={<MoreVertical size={19} />} actions={[
          ...(onExport ? [{ label: "내보내기", icon: <FolderOutput size={16} />, disabled: !items.length, onSelect: onExport }] : []),
          { label: "사진 순서 섞기", icon: <Shuffle size={16} />, disabled: items.length < 2, onSelect: () => resetOrder(true) },
          { label: "원래 순서로 보기", icon: <RotateCcw size={16} />, disabled: !order, onSelect: () => resetOrder(false) },
        ]} />
      </div>
    </header>
    {notice && <p className="albumReaderNotice" role="status">{notice}</p>}
    {listView ? <section className="albumPhotoList" aria-label={`${title} 사진 목록`}>
      {!items.length && <EmptyState text="앨범에 담긴 기록이 없습니다." />}
      {orderedItems.map((item) => <button key={item.id} onClick={() => onOpen(item, orderedItems)} aria-label={`${item.fileName} 상세보기`}><MediaVisual item={item} />
        <strong className="albumPhotoName">{item.fileName}</strong>
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
            const caption = entries.find((item) => item.comment.trim())?.comment;
            const date = entries[0]?.takenAt;
            return <section key={side} className={`albumPaper ${side}${entries.length === 1 ? " single-photo" : ""}${portrait ? " portrait-photo" : ""}`}>
              <div className="albumPageImages">{entries.map((item, index) => <AlbumPagePhoto key={item.id} item={item} index={sideIndex * 2 + index} side={side} onOpen={() => onOpen(item, orderedItems)} />)}</div>
              <div className="albumPageCaption">{caption && <p>{caption}</p>}{date && <time dateTime={date}>{date.replaceAll("-", ".")}</time>}</div>
              <span className="albumPageNumber">{currentPage * 2 + sideIndex + 1}</span>
            </section>;
          })}
          {turning && <span className={`albumTurningSheet ${turning}`} aria-hidden="true" />}
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

function AlbumPagePhoto({ item, index, side, onOpen }: { item: MediaItem; index: number; side: "left" | "right"; onOpen: () => void }) {
  return <button data-slot={index} data-side={side} className="albumPagePhoto" style={isPortraitMedia(item) ? { "--photo-ratio": item.width! / item.height! } as CSSProperties : undefined} onClick={onOpen} aria-label={`${item.fileName} 상세보기`}>
    <MediaVisual item={item} original>
      {item.fileType === "video" && <span className="videoDuration"><Play size={12} fill="currentColor" />{item.duration || "영상"}</span>}
      {item.fileType === "audio" && <Music className="mediaBadge" size={28} />}
    </MediaVisual>
  </button>;
}

