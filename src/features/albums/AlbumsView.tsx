import { useMemo, useRef, useState } from "react";
import { BookOpen, Check, CheckSquare, FolderOutput, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import { EmptyState } from "../../components/MediaVisual";
import { AlbumCover } from "./AlbumCover";
import { ActionMenu } from "../../components/ActionMenu";
import { ExportModal } from "../../components/ExportModal";
import { mediaSummary } from "../media/journalModel";
import { AlbumFullscreenReader } from "./AlbumReader";
import { AlbumEditor } from "./AlbumEditor";

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

  async function removeSelected() {
    if (deleting.current || !chosen.length) return;
    if (!window.confirm(`선택한 앨범 ${chosen.length}개를 삭제할까요? 원본 사진은 유지됩니다.`)) return;
    deleting.current = true;
    setBusy(true);
    setError("");
    try { await onDelete(chosen); setChosen([]); setSelecting(false); }
    catch { setError("앨범을 삭제하지 못했습니다. 다시 시도해 주세요."); }
    finally { deleting.current = false; setBusy(false); }
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

