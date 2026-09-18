import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, CheckSquare, ChevronLeft, ChevronRight, Dices, Music, Pencil, Play, Trash2, X } from "lucide-react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { AlbumColorPicker, AlbumCover } from "./AlbumCover";

type AlbumPage = MediaItem[];


export function SavedAlbumsView({
  albums,
  onOpen,
  onSave,
  onDelete,
}: {
  albums: SavedAlbum[];
  onOpen: (item: MediaItem) => void;
  onSave: (album: SavedAlbum) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
}) {
  const [activeAlbum, setActiveAlbum] = useState<SavedAlbum | null>(null);
  const [editing, setEditing] = useState<SavedAlbum | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        <div className="albumActions">
          {selecting && <>
            <button disabled={chosen.length !== 1 || busy} onClick={() => setEditing(albums.find((album) => album.id === chosen[0]) ?? null)}><Pencil size={17} />수정</button>
            <button disabled={!chosen.length || busy} onClick={() => void removeSelected()}><Trash2 size={17} />삭제</button>
          </>}
          <button disabled={busy} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setChosen([]); }}>
            {selecting ? <X size={17} /> : <CheckSquare size={17} />}{selecting ? "선택 끝내기" : "선택"}
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!albums.length && <EmptyState text="아직 만든 앨범이 없습니다. 모아보기에서 사진을 선택해 앨범을 만들어보세요." />}
      <div className="savedAlbumGrid">
        {albums.map((album) => {
          return (
          <article key={album.id} className="savedAlbumCard">
            <button className="savedAlbumOpen" disabled={busy} aria-pressed={selecting ? chosen.includes(album.id) : undefined} onClick={() => selecting ? setChosen((current) => current.includes(album.id) ? current.filter((id) => id !== album.id) : [...current, album.id]) : setActiveAlbum(album)} aria-label={`${album.title} 앨범 ${selecting ? "선택" : "열기"}`}>
              {selecting && <span className={`albumSelectionMark ${chosen.includes(album.id) ? "checked" : ""}`}>{chosen.includes(album.id) && <Check size={22} strokeWidth={3} />}</span>}
              <AlbumCover title={album.title} items={album.items} color={album.coverColor} />
            </button>
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
          onClose={() => setActiveAlbum(null)}
        />
      )}
      {editing && <AlbumEditor album={editing} onClose={() => setEditing(null)} onSave={onSave} />}
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

export function AlbumFullscreenReader({
  title,
  items,
  color = "#414143",
  open,
  onOpen,
  onClose,
}: {
  title: string;
  items: MediaItem[];
  color?: string;
  open: boolean;
  onOpen: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<AlbumPage[]>(() => makeAlbumPages(items, 4));
  const [pageIndex, setPageIndex] = useState(0);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const [turnPhase, setTurnPhase] = useState<"departing" | "arriving" | null>(null);
  const [visibleItems, setVisibleItems] = useState<AlbumPage>(() => pages[0] ?? []);
  const timers = useRef<number[]>([]);
  const turnLock = useRef(false);
  const mediaOrderKey = items.map((item) => item.id).join("|");

  function cancelTurn() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    turnLock.current = false;
  }

  function schedule(action: () => void, delay: number) {
    timers.current.push(window.setTimeout(action, delay));
  }

  useEffect(() => {
    cancelTurn();
    const nextPages = makeAlbumPages(items, 4);
    setPages(nextPages);
    setPageIndex(0);
    setTurning(null);
    setTurnPhase(null);
    setVisibleItems(nextPages[0] ?? []);
    return cancelTurn;
  }, [mediaOrderKey]);

  useModalBehavior(onClose, { enabled: open, onPrev: () => turnPage(-1), onNext: () => turnPage(1) });

  function shuffleAlbum() {
    cancelTurn();
    const nextPages = makeAlbumPages(items, 4);
    setPages(nextPages);
    setPageIndex(0);
    setTurning(null);
    setTurnPhase(null);
    setVisibleItems(nextPages[0] ?? []);
  }

  function turnPage(direction: -1 | 1) {
    if (turnLock.current || !pages.length) return;
    const nextIndex = Math.min(Math.max(pageIndex + direction, 0), pages.length - 1);
    if (nextIndex === pageIndex) return;
    turnLock.current = true;

    setTurning(direction > 0 ? "next" : "prev");
    setTurnPhase("departing");
    schedule(() => { setTurnPhase("arriving"); setVisibleItems(pages[nextIndex] ?? []); setPageIndex(nextIndex); }, 300);
    schedule(() => { setTurnPhase(null); setTurning(null); cancelTurn(); }, 820);
  }

  if (!open) return null;

  return (
        <div className="albumFullscreen" style={{ "--album-color": color } as CSSProperties} role="dialog" aria-modal="true" aria-label="앨범 전체창">
          <header className="albumFullscreenHeader">
            <div>
              <h2>{title}</h2>
            </div>
            <div className="panelActions">
              <button className="iconText" onClick={shuffleAlbum}><Dices size={17} />다시 섞기</button>
              <button className="closeButton" onClick={onClose} title="닫기"><X size={18} /></button>
            </div>
          </header>
          {!items.length && <EmptyState text="앨범에 사진이 없습니다." />}
          <div className="albumReadingStage">
            <div className={`binderStage ${turning ? `turning-${turning}` : ""} ${turning && turnPhase ? `${turnPhase}-${turning}` : ""}`} data-turn-phase={turnPhase ?? undefined} aria-label="양면 포토앨범 책장">
              <div className="binderBook">
                <section className="binderPage left">
                  {visibleItems.slice(0, 2).map((item, index) => <AlbumMountedPhoto key={item.id} item={item} index={index} side="left" onOpen={onOpen} />)}
                  <span className="binderPageNumber">{pageIndex * 2 + 1}</span>
                </section>
                <section className="binderPage right">
                  {visibleItems.slice(2, 4).map((item, index) => <AlbumMountedPhoto key={item.id} item={item} index={index + 2} side="right" onOpen={onOpen} />)}
                  <span className="binderPageNumber">{pageIndex * 2 + 2}</span>
                </section>
                {turning && <span className={`binderTurnLayer ${turning}`} aria-hidden="true" />}
              </div>
            </div>
          </div>
          <footer className="albumReaderControls">
            <button onClick={() => turnPage(-1)} disabled={Boolean(turning) || pageIndex === 0} title="이전 책장"><ChevronLeft size={22} /></button>
            <p className="albumPager" aria-live="polite">{pages.length ? pageIndex + 1 : 0} / {pages.length} 책장</p>
            <button onClick={() => turnPage(1)} disabled={Boolean(turning) || pageIndex >= pages.length - 1} title="다음 책장"><ChevronRight size={22} /></button>
          </footer>
        </div>
  );
}

function AlbumMountedPhoto({ item, index, side, onOpen }: { item: MediaItem; index: number; side: "left" | "right"; onOpen: (item: MediaItem) => void }) {
  return <button data-slot={index} data-side={side} className="albumMountedPhoto" onClick={() => onOpen(item)} aria-label="사진 상세보기">
    <MediaVisual item={item} original>
      {item.fileType === "video" && <Play size={28} fill="currentColor" />}
      {item.fileType === "audio" && <Music size={28} />}
    </MediaVisual>
  </button>;
}

function makeAlbumPages(items: MediaItem[], pageSize: number): AlbumPage[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const pages: AlbumPage[] = [];
  let index = 0;
  while (index < shuffled.length) {
    const remaining = shuffled.length - index;
    const count = Math.min(remaining, pageSize);
    pages.push(shuffled.slice(index, index + count));
    index += count;
  }
  return pages.length ? pages : [[]];
}
