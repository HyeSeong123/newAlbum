import { useMemo, useRef, useState } from "react";
import { BookPlus, Check, CheckSquare, FolderOutput, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { ActionMenu } from "../../components/ActionMenu";
import { ExportModal } from "../../components/ExportModal";
import { mediaSummary } from "../media/journalModel";
import { AlbumFullscreenReader } from "./AlbumReader";
import type { DiaryEntry } from "../diary/DiaryView";
import { AlbumEditor, type AlbumEditorSection } from "./AlbumEditor";

export function SavedAlbumsView({
  albums,
  diaries = [],
  onOpen,
  onSave,
  onDelete,
  onNewAlbum,
  query = "",
}: {
  albums: SavedAlbum[];
  diaries?: DiaryEntry[];
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onSave: (album: SavedAlbum) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onNewAlbum: () => void;
  query?: string;
}) {
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const activeAlbum = albums.find((album) => album.id === activeAlbumId);
  const [editing, setEditing] = useState<{ album: SavedAlbum; section: AlbumEditorSection } | null>(null);
  const openEditor = (album: SavedAlbum, section: AlbumEditorSection = "contents") => setEditing({ album, section });
  const [exporting, setExporting] = useState<SavedAlbum | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"recent" | "old" | "name">("recent");
  const visibleAlbums = useMemo(() => {
    const search = query.toLowerCase();
    return albums.filter((album) => album.title.toLowerCase().includes(search)).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title, "ko");
    return sort === "recent" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt);
    });
  }, [albums, query, sort]);

  async function removeAlbums(ids: string[]) {
    if (deleting.current || !ids.length) return;
    if (!window.confirm(`선택한 앨범 ${ids.length}개를 삭제할까요? 원본 사진은 유지됩니다.`)) return;
    deleting.current = true;
    setBusy(true);
    setError("");
    try { await onDelete(ids); setChosen([]); setSelecting(false); }
    catch { setError("앨범을 삭제하지 못했습니다. 다시 시도해 주세요."); }
    finally { deleting.current = false; setBusy(false); }
  }

  return (
    <div className="savedAlbums">
      <p className="savedAlbumsIntro">소중한 순간을 한 권씩 모아 두세요.</p>
      <div className="panelHeader">
        <label className="albumSort"><select aria-label="앨범 정렬" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">최근 만든 순</option><option value="old">오래된 순</option><option value="name">이름순</option></select></label>
        <div className="albumActions">
          <button disabled={busy} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setChosen([]); }}>
            {selecting ? <X size={17} /> : <CheckSquare size={17} />}{selecting ? "선택 끝내기" : "선택"}
          </button>
          {selecting && <>
            <button disabled={chosen.length !== 1 || busy} onClick={() => { const album = albums.find(item => item.id === chosen[0]); if (album) openEditor(album); }}><Pencil size={17} />수정</button>
            <button disabled={!chosen.length || busy} onClick={() => void removeAlbums(chosen)}><Trash2 size={17} />삭제</button>
          </>}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!albums.length && <EmptyState title="아직 만든 앨범이 없습니다." description="함께 보고 싶은 사진을 골라 한 권의 앨범으로 만들어보세요." actionLabel="첫 앨범 만들기" actionIcon={<BookPlus size={18} />} onAction={onNewAlbum} />}
      {albums.length > 0 && !visibleAlbums.length && <EmptyState text="검색한 이름의 앨범이 없습니다." />}
      <div className="savedAlbumGrid">
        {visibleAlbums.map((album) => {
          const cover = album.items.find(item => item.fileType === "image") ?? album.items[0];
          return (
          <article key={album.id} className="savedAlbumCard">
            <div className="savedAlbumCover">
            <button className="savedAlbumOpen" disabled={busy} aria-pressed={selecting ? chosen.includes(album.id) : undefined} onClick={() => selecting ? setChosen((current) => current.includes(album.id) ? current.filter((id) => id !== album.id) : [...current, album.id]) : setActiveAlbumId(album.id)} aria-label={`${album.title} 앨범 ${selecting ? "선택" : "열기"}`}>
              {selecting && <span className={`albumSelectionMark ${chosen.includes(album.id) ? "checked" : ""}`}>{chosen.includes(album.id) && <Check size={22} strokeWidth={3} />}</span>}
              <span className="savedAlbumPhoto">{cover ? <MediaVisual item={cover} fit="contain" /> : <BookPlus size={34} aria-hidden="true" />}</span>
            </button>
            </div>
            <div className="savedAlbumFooter">
              <div className="savedAlbumInfo"><button className="savedAlbumTitle" disabled={busy} onClick={() => selecting ? setChosen(current => current.includes(album.id) ? current.filter(id => id !== album.id) : [...current, album.id]) : setActiveAlbumId(album.id)}>{album.title}</button><span className="savedAlbumMeta">{mediaSummary(album.items)}{diaries.some(d => d.album_id === Number(album.id)) && ` · 일기 ${diaries.filter(d => d.album_id === Number(album.id)).length}편`}</span></div>
              {!selecting && <ActionMenu label={`${album.title} 앨범 메뉴`} icon={<MoreHorizontal size={20} />} disabled={busy} actions={[
                { label: "앨범 수정", icon: <Pencil size={16} />, onSelect: () => openEditor(album) },
                { label: "앨범 내보내기", icon: <FolderOutput size={16} />, disabled: !album.items.length, onSelect: () => setExporting(album) },
                { label: "앨범 삭제", icon: <Trash2 size={16} />, danger: true, onSelect: () => void removeAlbums([album.id]) },
              ]} />}
            </div>
          </article>
          );
        })}
      </div>
      {activeAlbum && (
        <AlbumFullscreenReader
          title={activeAlbum.title}
          items={activeAlbum.items}
          contents={[...(activeAlbum.contents ?? []), ...diaries.filter(d => d.album_id === Number(activeAlbum.id)).map(d => ({ id: `diary-${d.id}`, kind: "TEXT" as const, title: `${d.date} · ${d.title}`, body: `${d.mood} · ${d.weather}\n\n${d.body}`, displayDuration: 5, transitionType: "fade" as const, commentVisible: true }))]}
          musicPath={activeAlbum.musicPath}
          color={activeAlbum.coverColor}
          open={true}
          onOpen={onOpen}
          onClose={() => setActiveAlbumId(null)}
          onExport={() => setExporting(activeAlbum)}
          onEdit={() => openEditor(activeAlbum)}
        />
      )}
      {editing && <AlbumEditor key={editing.album.id} album={editing.album} initialSection={editing.section} onClose={() => setEditing(null)} onSave={onSave} />}
      {exporting && <ExportModal title={exporting.title} items={exporting.items} onClose={() => setExporting(null)} />}
    </div>
  );
}
