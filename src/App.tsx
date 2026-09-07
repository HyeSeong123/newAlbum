import { Calendar } from "./features/calendar/Calendar";
import { PeopleWorkspace } from "./features/people/PeopleWorkspace";
import { SavedAlbumsView, AlbumFullscreenReader, ALBUM_COVER_COLORS } from "./features/albums/AlbumsView";
import { EmptyState, MediaImage, MediaVisual } from "./components/MediaVisual";
import { useModalBehavior } from "./hooks/useModalBehavior";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRowSelection } from "./hooks/useRowSelection";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock3, BookOpen, FolderOpen, Heart, Image, LayoutGrid, LoaderCircle, ListTree, Maximize2, MessageSquare, Music, Pencil, Play, Plus, Search, Settings, SlidersHorizontal, Sparkles, Star, Trash2, Upload, Users, X } from "lucide-react";
import { groupByTakenDate, isSupportedMedia } from "./features/media/mediaService";
import {
  chooseAndRegisterFiles,
  chooseAndRegisterFolder,
  clearRegisteredMedia,
  createAlbumFromMedia,
  deleteRegisteredMedia,
  isTauriRuntime,
  loadRegisteredMedia,
  loadSavedAlbums,
  saveAlbum,
  deleteAlbums,
  saveMediaDetails,
} from "./services/tauriMediaService";
import type { MediaItem, SavedAlbum } from "./types/media";

type View = "Library" | "Albums" | "Timeline" | "Memories" | "People" | "Settings";
type PhotoMode = "grid" | "calendar" | "album";

type MediaComment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};
type MediaComments = Record<string, MediaComment[]>;

const GALLERY_PAGE_SIZE = 48;

const MEDIA_COMMENT_STORAGE_KEY = "oraedameun.mediaComments";

const viewLabels: Record<View, string> = {
  Library: "사진보기",
  Albums: "내 앨범",
  Timeline: "시간순",
  Memories: "지난 추억",
  People: "인물",
  Settings: "설정",
};

const navItems: Array<{ name: View; label: string; icon: typeof LayoutGrid }> = [
  { name: "Library", label: viewLabels.Library, icon: LayoutGrid },
  { name: "Albums", label: viewLabels.Albums, icon: BookOpen },
  { name: "Timeline", label: viewLabels.Timeline, icon: ListTree },
  { name: "Memories", label: viewLabels.Memories, icon: Sparkles },
  { name: "People", label: viewLabels.People, icon: Users },
  { name: "Settings", label: viewLabels.Settings, icon: Settings },
];

export function App() {
  const [activeView, setActiveView] = useState<View>("Library");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("grid");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<SavedAlbum[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [mediaComments, setMediaComments] = useState<MediaComments>(() => loadMediaComments());
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState<"files" | "folder" | null>(null);
  const [clearing, setClearing] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const tauriEnabled = isTauriRuntime();

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const haystack = `${item.fileName} ${item.comment} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [items, query]);

  const groups = useMemo(() => groupByTakenDate(filtered), [filtered]);
  const todayMemories = items.filter((item) => item.takenAt?.endsWith("-08-30"));
  const selectedCount = selectedIds.size;

  useEffect(() => {
    if (!tauriEnabled) return;
    loadRegisteredMedia()
      .then((registered) => {
        setItems(registered);
      })
      .catch((error) => console.error("등록된 미디어를 불러오지 못했습니다.", error));
    loadSavedAlbums()
      .then(setSavedAlbums)
      .catch((error) => console.error("앨범 목록을 불러오지 못했습니다.", error));
  }, [tauriEnabled]);

  useEffect(() => {
    const itemIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => new Set([...current].filter((id) => itemIds.has(id))));
  }, [items]);

  async function registerWithTauri(kind: "files" | "folder") {
    setImporting(kind);
    try {
      const registered = kind === "files" ? await chooseAndRegisterFiles() : await chooseAndRegisterFolder();
      if (!registered.length) return;
      setItems(registered);
    } catch (error) {
      console.error("미디어를 등록하지 못했습니다.", error);
    } finally {
      setImporting(null);
    }
  }

  function chooseFiles() {
    if (importing) return;
    if (tauriEnabled) {
      void registerWithTauri("files");
      return;
    }
    fileInput.current?.click();
  }

  function chooseFolder() {
    if (importing) return;
    if (tauriEnabled) {
      void registerWithTauri("folder");
      return;
    }
    folderInput.current?.click();
  }

  function handleFiles(files: FileList | null, kind: "files" | "folder") {
    if (!files?.length) return;
    setImporting(kind);
    const accepted = Array.from(files).filter((file) => isSupportedMedia(file.name));
    const next = accepted.map<MediaItem>((file, index) => {
      const filePath = `선택한 로컬 파일/${file.webkitRelativePath || file.name}`;
      return {
        id: `local-${Date.now()}-${index}`,
        fileName: file.name,
        filePath,
        fileType: file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image",
        takenAt: new Date(file.lastModified).toISOString().slice(0, 10),
        sizeLabel: `${Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB`,
        rating: 0,
        comment: "",
        favorite: false,
        tags: ["new"],
        thumbnail: "linear-gradient(135deg, #ece0ca 0%, #b8c1a4 50%, #4d5856 100%)",
        metadataStatus: "queued",
      };
    });
    const knownPaths = new Set(items.map((item) => item.filePath));
    const uniqueNext = next.filter((item) => !knownPaths.has(item.filePath));
    setItems((current) => [...uniqueNext, ...current]);
    setImporting(null);
  }

  async function clearAllRegisteredMedia() {
    if (clearing) return;
    const confirmed = window.confirm("등록 목록을 모두 비울까요? 원본 사진과 영상 파일은 삭제되지 않습니다.");
    if (!confirmed) return;

    setClearing(true);
    try {
      if (tauriEnabled) {
        const registered = await clearRegisteredMedia();
        setItems(registered);
      } else {
        setItems([]);
      }
      setSelected(null);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error) {
      console.error("등록 목록을 비우지 못했습니다.", error);
    } finally {
      setClearing(false);
    }
  }

  function updateSelected(patch: Partial<MediaItem>) {
    if (!selected) return;
    const updated = { ...selected, ...patch };
    setSelected(updated);
    setItems((current) => current.map((item) => (item.id === selected.id ? updated : item)));
    if (tauriEnabled) {
      void saveMediaDetails(updated).catch((error) => console.error("미디어 정보를 저장하지 못했습니다.", error));
    }
  }

  function addSelectedComment(author: string, content: string) {
    if (!selected) return;
    const comment: MediaComment = {
      id: `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      author,
      content,
      createdAt: new Date().toISOString(),
    };

    setMediaComments((current) => {
      const next = {
        ...current,
        [selected.id]: [...(current[selected.id] ?? []), comment],
      };
      saveMediaComments(next);
      return next;
    });
    updateSelected({ comment: content });
  }

  function updateSelectedComment(commentId: string, author: string, content: string) {
    if (!selected) return;
    const currentComments = getMediaComments(selected, mediaComments);
    const nextComments = currentComments.map((comment) => (
      comment.id === commentId ? { ...comment, author, content } : comment
    ));

    setMediaComments((current) => {
      const next = { ...current, [selected.id]: nextComments };
      saveMediaComments(next);
      return next;
    });
    updateSelected({ comment: nextComments.at(-1)?.content ?? "" });
  }

  function deleteSelectedComment(commentId: string) {
    if (!selected) return;
    const nextComments = getMediaComments(selected, mediaComments).filter((comment) => comment.id !== commentId);

    setMediaComments((current) => {
      const next = { ...current };
      if (nextComments.length) {
        next[selected.id] = nextComments;
      } else {
        delete next[selected.id];
      }
      saveMediaComments(next);
      return next;
    });
    updateSelected({ comment: nextComments.at(-1)?.content ?? "" });
  }

  function moveSelection(direction: -1 | 1) {
    if (!selected) return;
    const index = filtered.findIndex((item) => item.id === selected.id);
    const next = filtered[(index + direction + filtered.length) % filtered.length];
    setSelected(next);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      const next = !current;
      if (!next) setSelectedIds(new Set());
      if (next) setSelected(null);
      setSelectionNotice("");
      return next;
    });
  }

  function toggleMediaSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openMedia(item: MediaItem) {
    if (selectionMode) {
      toggleMediaSelection(item.id);
      return;
    }
    setSelected(item);
  }

  async function deleteSelectedItems() {
    if (!selectedCount) return;
    const confirmed = window.confirm(`선택한 ${selectedCount}개 항목을 등록 목록에서 지울까요? 원본 파일은 삭제되지 않습니다.`);
    if (!confirmed) return;

    const ids = [...selectedIds];
    try {
      if (tauriEnabled) {
        const remaining = await deleteRegisteredMedia(ids);
        setItems(remaining);
      } else {
        setItems((current) => current.filter((item) => !selectedIds.has(item.id)));
      }
      setSelectedIds(new Set());
      setSelectionNotice(`${ids.length}개 항목을 등록 목록에서 지웠습니다.`);
    } catch (error) {
      console.error("선택한 항목을 삭제하지 못했습니다.", error);
    }
  }

  async function createAlbumFromSelectedItems() {
    if (!selectedCount) return;
    const title = window.prompt("새 앨범 이름을 입력해 주세요.", "새 추억 앨범");
    if (!title?.trim()) return;

    try {
      if (tauriEnabled) {
        await createAlbumFromMedia(title.trim(), [...selectedIds]);
        setSavedAlbums(await loadSavedAlbums());
      } else {
        const albumItems = items.filter((item) => selectedIds.has(item.id));
        setSavedAlbums((current) => [
          {
            id: `local-album-${Date.now()}`,
            title: title.trim(),
            description: "",
            createdAt: new Date().toISOString(),
            coverColor: ALBUM_COVER_COLORS[0],
            items: albumItems,
          },
          ...current,
        ]);
      }
      setSelectionNotice(`'${title.trim()}' 앨범에 ${selectedCount}개 항목을 담았습니다.`);
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("앨범을 만들지 못했습니다.", error);
    }
  }

  return (
    <main className="app">
      <header className="sidebar" aria-label="주 메뉴">
        <div className="brand">
          <div className="brandMark"><Image size={22} /></div>
          <div>
            <strong>오래담은</strong>
          </div>
        </div>

        <nav className="navList" aria-label="주 메뉴">
          {navItems.map(({ name, label, icon: Icon }) => (
            <button
              key={name}
              className={activeView === name ? "active" : ""}
              onClick={() => setActiveView(name)}
              aria-pressed={activeView === name}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="memoryNote" aria-label="앨범 요약">
          <strong>{items.length}개의 순간</strong>
        </section>
      </header>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewLabels[activeView]}</h1>
            <span className="collectionCount">{items.length}개의 기록</span>
          </div>
          <div className="toolbar">
            <label className="searchBox">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="코멘트, 태그 검색" />
            </label>
            <div className="importActions">
              <button className="primary" onClick={chooseFiles} disabled={Boolean(importing)}>
                {importing === "files" ? <LoaderCircle className="spinIcon" size={18} /> : <Upload size={18} />}
                {importing === "files" ? "파일 등록 중" : "파일 선택"}
              </button>
              <button onClick={chooseFolder} disabled={Boolean(importing)}>
                {importing === "folder" ? <LoaderCircle className="spinIcon" size={18} /> : <FolderOpen size={18} />}
                {importing === "folder" ? "폴더 등록 중" : "폴더 선택"}
              </button>
              {importing && (
                <div className="importStatus" role="status" aria-live="polite">
                  <LoaderCircle className="spinIcon" size={18} />
                  <span>{importing === "folder" ? "폴더 안의 사진과 영상을 살펴보고 있어요." : "선택한 파일을 앨범에 담고 있어요."}</span>
                </div>
              )}
            </div>
            <input ref={fileInput} type="file" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files, "files")} hidden />
            <input
              ref={folderInput}
              type="file"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files, "folder")}
              hidden
              {...({ webkitdirectory: "" } as Record<string, string>)}
            />
          </div>
        </header>

        <section className="contentGrid">
          <div className="mainPanel">
            {activeView === "Library" && (
              <PhotoView
                mode={photoMode}
                setMode={setPhotoMode}
                items={filtered}
                selected={selected}
                onOpen={openMedia}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelection={toggleMediaSelection}
                onToggleSelectionMode={toggleSelectionMode}
                selectedCount={selectedCount}
                onCreateAlbum={createAlbumFromSelectedItems}
                onDeleteSelected={deleteSelectedItems}
              />
            )}
            {activeView === "Albums" && <SavedAlbumsView albums={savedAlbums} onOpen={openMedia} onSave={async (album) => {
              if (tauriEnabled) await saveAlbum(album);
              setSavedAlbums((current) => current.map((entry) => entry.id === album.id ? album : entry));
            }} onDelete={async (ids) => {
              if (tauriEnabled) await deleteAlbums(ids);
              setSavedAlbums((current) => current.filter((album) => !ids.includes(album.id)));
            }} />}
            {activeView === "Timeline" && <Timeline groups={groups} onOpen={openMedia} />}
            {activeView === "Memories" && <Memories items={todayMemories} onOpen={openMedia} />}
            {activeView === "People" && <PeopleWorkspace items={items} onOpen={openMedia} />}
            {activeView === "Settings" && <SettingsPanel itemCount={items.length} clearing={clearing} onClear={clearAllRegisteredMedia} />}
          </div>
        </section>
        {selectionNotice && <p className="selectionNotice">{selectionNotice}</p>}
        {selected && (
          <DetailModal
            item={selected}
            comments={getMediaComments(selected, mediaComments)}
            onChange={updateSelected}
            onAddComment={addSelectedComment}
            onUpdateComment={updateSelectedComment}
            onDeleteComment={deleteSelectedComment}
            onClose={() => setSelected(null)}
            onPrev={() => moveSelection(-1)}
            onNext={() => moveSelection(1)}
          />
        )}
      </section>
    </main>
  );
}

function PhotoView({
  mode,
  setMode,
  items,
  selected,
  onOpen,
  selectionMode,
  selectedIds,
  onToggleSelection,
  onToggleSelectionMode,
  selectedCount,
  onCreateAlbum,
  onDeleteSelected,
}: {
  mode: PhotoMode;
  setMode: (mode: PhotoMode) => void;
  items: MediaItem[];
  selected: MediaItem | null;
  onOpen: (item: MediaItem) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  onCreateAlbum: () => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div className={`photoWorkspace mode-${mode}`}>
      <div className="viewTabs" role="tablist" aria-label="사진 보기 방식">
        <button role="tab" aria-selected={mode === "grid"} className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}>
          <LayoutGrid size={17} />모아보기
        </button>
        <button role="tab" aria-selected={mode === "calendar"} className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>
          <CalendarDays size={17} />달력보기
        </button>
        <button role="tab" aria-selected={mode === "album"} className={mode === "album" ? "active" : ""} onClick={() => setMode("album")}>
          <Image size={17} />앨범보기
        </button>
      </div>
      {mode !== "calendar" && (
        <Library
          items={items}
          selected={selected}
          onOpen={onOpen}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelection={onToggleSelection}
          onToggleSelectionMode={onToggleSelectionMode}
          selectedCount={selectedCount}
          onCreateAlbum={onCreateAlbum}
          onDeleteSelected={onDeleteSelected}
        />
      )}
      {mode === "calendar" && <Calendar items={items} onOpen={onOpen} />}
      {mode === "album" && <AlbumFullscreenReader title="나의 앨범" items={items} open={true} onOpen={onOpen} onClose={() => setMode("grid")} />}
    </div>
  );
}

function Library({
  items,
  selected,
  onOpen,
  selectionMode,
  selectedIds,
  onToggleSelection,
  onToggleSelectionMode,
  selectedCount,
  onCreateAlbum,
  onDeleteSelected,
}: {
  items: MediaItem[];
  selected: MediaItem | null;
  onOpen: (item: MediaItem) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  onCreateAlbum: () => void;
  onDeleteSelected: () => void;
}) {
  const [page, setPage] = useState(1);
  const dragSelection = useRowSelection(selectionMode, onToggleSelection, (id) => selectedIds.has(id));
  const pageCount = Math.max(1, Math.ceil(items.length / GALLERY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * GALLERY_PAGE_SIZE;
  const visibleItems = items.slice(startIndex, startIndex + GALLERY_PAGE_SIZE);
  const rangeStart = items.length ? startIndex + 1 : 0;
  const rangeEnd = Math.min(startIndex + GALLERY_PAGE_SIZE, items.length);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <>
      <div className="panelHeader collectionTools">
        <div className="panelActions">
          <button className={selectionMode ? "selectionToggle activeAction" : "selectionToggle"} onClick={onToggleSelectionMode}>
            {selectionMode ? <X size={17} /> : <CheckSquare size={17} />}
            {selectionMode ? "선택 끝내기" : "사진 선택"}
          </button>
          <button className="iconText"><SlidersHorizontal size={17} />필터</button>
        </div>
      </div>
      {selectionMode && (
        <div className="selectionDock" aria-label={`${selectedCount}장 선택됨`}>
          <div className="selectionActions">
            <button className="iconText" onClick={onCreateAlbum} disabled={!selectedCount}>
              <Plus size={17} />앨범 만들기
            </button>
            <button className="dangerButton" onClick={onDeleteSelected} disabled={!selectedCount}>
              <Trash2 size={17} />삭제
            </button>
          </div>
        </div>
      )}
      {!items.length && <EmptyState text="아직 담긴 사진과 영상이 없습니다. 위의 파일 선택 또는 폴더 선택으로 첫 기록을 담아보세요." />}
      <div
        className={selectionMode ? "galleryGrid selecting" : "galleryGrid"}
        {...dragSelection}
      >
        {visibleItems.map((item) => (
          <button
            key={item.id}
            data-media-id={item.id}
            data-selection-id={item.id}
            className={[
              "mediaTile",
              selected?.id === item.id ? "selected" : "",
              selectedIds.has(item.id) ? "multiSelected" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => onOpen(item)}
            aria-pressed={selectionMode ? selectedIds.has(item.id) : undefined}
          >
            <MediaVisual item={item} className="thumb">
              {item.fileType === "video" && <Play className="mediaBadge" size={24} fill="currentColor" />}
              {item.fileType === "audio" && <Music className="mediaBadge" size={24} />}
              {item.favorite && <Heart className="fav" size={17} fill="currentColor" />}
              {selectionMode && (
                <span className="selectMark" aria-label={selectedIds.has(item.id) ? "선택됨" : "선택 안 됨"}>
                </span>
              )}
            </MediaVisual>
            <small className="mediaDate">{item.takenAt ?? "날짜 없음"}</small>
          </button>
        ))}
      </div>
      {items.length > GALLERY_PAGE_SIZE && (
        <nav className="pagination" aria-label="모아보기 페이지">
          <span>{rangeStart}-{rangeEnd} / {items.length}장</span>
          <div>
            <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1}>
              <ChevronLeft size={17} />이전
            </button>
            <strong>{currentPage} / {pageCount}</strong>
            <button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount}>
              다음<ChevronRight size={17} />
            </button>
          </div>
        </nav>
      )}
    </>
  );
}

function Timeline({ groups, onOpen }: { groups: Record<string, MediaItem[]>; onOpen: (item: MediaItem) => void }) {
  const entries = Object.entries(groups);
  return (
    <div className="timeline">
      {!entries.length && <EmptyState text="시간순으로 보여줄 기록이 아직 없습니다." />}
      {entries.map(([date, items]) => (
        <section className="dateGroup" key={date}>
          <h2>{date}</h2>
          <div className="strip">
            {items.map((item) => (
              <button key={item.id} className="stripItem" onClick={() => onOpen(item)} style={{ background: item.thumbnail }}>
                <MediaImage item={item} />
                <span>{item.comment || "기록 보기"}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Memories({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  return (
    <div className="memories">
      <h2>몇 년 전 오늘</h2>
      {!items.length && <EmptyState text="오늘과 같은 날짜의 예전 기록이 아직 없습니다." />}
      <div className="memoryGrid">
        {items.map((item) => (
          <button key={item.id} onClick={() => onOpen(item)}>
            <MediaVisual item={item} />
            <strong>{item.takenAt?.slice(0, 4)}</strong>
            <span>{item.comment || "추억 기록"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ itemCount, clearing, onClear }: { itemCount: number; clearing: boolean; onClear: () => void }) {
  return (
    <div className="settingsPanel">
      <label>
        <span>사진을 불러올 기본 위치</span>
        <input readOnly value="D:/Pictures" />
      </label>
      <label>
        <span>미리보기 저장 위치</span>
        <input readOnly value="D:/오래담은/미리보기" />
      </label>
      <label>
        <span>앱 시작 화면</span>
        <input readOnly value="사진보기" />
      </label>
      <section className="dangerPanel" aria-label="등록 목록 관리">
        <div>
          <h2>등록 목록 비우기</h2>
          <p>앱에 등록된 {itemCount}개의 항목만 지웁니다. 원본 파일은 그대로 남습니다.</p>
        </div>
        <button className="dangerButton" onClick={onClear} disabled={clearing || itemCount === 0}>
          {clearing ? <LoaderCircle className="spinIcon" size={17} /> : <Trash2 size={17} />}
          {clearing ? "비우는 중" : "모두 비우기"}
        </button>
      </section>
    </div>
  );
}

function DetailModal({
  item,
  comments,
  onChange,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaItem;
  comments: MediaComment[];
  onChange: (patch: Partial<MediaItem>) => void;
  onAddComment: (author: string, content: string) => void;
  onUpdateComment: (commentId: string, author: string, content: string) => void;
  onDeleteComment: (commentId: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingAuthor, setEditingAuthor] = useState("");
  const [editingContent, setEditingContent] = useState("");
  useModalBehavior(onClose, { onPrev, onNext });

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const author = commentAuthor.trim();
    const content = commentContent.trim();
    if (!author || !content) return;
    onAddComment(author, content);
    setCommentContent("");
  }

  function startEditComment(comment: MediaComment) {
    setEditingCommentId(comment.id);
    setEditingAuthor(comment.author);
    setEditingContent(comment.content);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingAuthor("");
    setEditingContent("");
  }

  function submitEditedComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCommentId) return;
    const author = editingAuthor.trim();
    const content = editingContent.trim();
    if (!author || !content) return;
    onUpdateComment(editingCommentId, author, content);
    cancelEditComment();
  }

  return (
    <div className="modalBackdrop photoLightboxBackdrop" role="presentation">
      <section className="detailModal photoLightbox" role="dialog" aria-modal="true" aria-labelledby="detailTitle" onClick={(event) => event.stopPropagation()}>
        <div className="detailHeader">
          <strong id="detailTitle">사진 상세</strong>
          <button className={item.favorite ? "favorite active" : "favorite"} title="즐겨찾기" aria-pressed={item.favorite} onClick={() => onChange({ favorite: !item.favorite })}>
            <Heart size={19} fill={item.favorite ? "currentColor" : "none"} />
          </button>
          <button title="댓글" aria-expanded={commentsOpen} aria-controls="photoComments" onClick={() => setCommentsOpen(!commentsOpen)}><MessageSquare size={19} /></button>
          <button title={zoomed ? "화면에 맞추기" : "확대"} aria-pressed={zoomed} onClick={() => setZoomed((current) => !current)}>
            <Maximize2 size={18} />
          </button>
          <button className="closeButton" title="닫기" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="detailLayout">
          <div className="detailPhotoPane">
            <MediaVisual item={item} className={zoomed ? "detailStage zoomed" : "detailStage"}>
              {item.fileType === "video" && <Play size={52} fill="currentColor" />}
              {item.fileType === "audio" && <Music size={52} />}
              <button className="photoNavButton prev" title="이전" onClick={onPrev}><ChevronLeft size={22} /></button>
              <button className="photoNavButton next" title="다음" onClick={onNext}><ChevronRight size={22} /></button>
            </MediaVisual>
          </div>
          <div className="detailBody">
            <div className="detailInfoStrip">
            <div className="viewerMeta">
              <span><Clock3 size={14} />{item.takenAt ?? "날짜 없음"}</span>
              <span>{item.width && item.height ? `${item.width} x ${item.height}` : item.duration} · {item.sizeLabel}</span>
            </div>
            <section className="detailSection" aria-label="별점">
              <strong>별점</strong>
              <div className="rating">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} onClick={() => onChange({ rating: score })} title={`${score}점`}>
                    <Star size={20} fill={score <= item.rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </section>
            </div>
            {commentsOpen && <section id="photoComments" className="detailSection commentBox" aria-label="댓글">
              <strong>댓글 {comments.length}</strong>
              <form className="commentForm" onSubmit={submitComment}>
                <label>
                  <span>작성자</span>
                  <input value={commentAuthor} onChange={(event) => setCommentAuthor(event.target.value)} placeholder="작성자" />
                </label>
                <label>
                  <span>내용</span>
                  <textarea value={commentContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCommentContent(event.target.value)} placeholder="내용 입력" />
                </label>
                <button type="submit" disabled={!commentAuthor.trim() || !commentContent.trim()}>
                  <CheckSquare size={17} />확인
                </button>
              </form>
              <div className="commentList">
                {!comments.length && <p>아직 남긴 댓글이 없습니다.</p>}
                {comments.map((comment) => (
                  <article key={comment.id} className="commentItem">
                    {editingCommentId === comment.id ? (
                      <form className="commentEditForm" onSubmit={submitEditedComment}>
                        <label>
                          <span>작성자</span>
                          <input value={editingAuthor} onChange={(event) => setEditingAuthor(event.target.value)} placeholder="작성자" />
                        </label>
                        <label>
                          <span>내용</span>
                          <textarea value={editingContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEditingContent(event.target.value)} placeholder="내용 입력" />
                        </label>
                        <div className="commentEditActions">
                          <button type="submit" disabled={!editingAuthor.trim() || !editingContent.trim()}><CheckSquare size={16} />저장</button>
                          <button type="button" onClick={cancelEditComment}><X size={16} />취소</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div>
                          <strong>{comment.author}</strong>
                          {comment.createdAt && <time>{formatDateTimeKo(comment.createdAt)}</time>}
                        </div>
                        <p>{comment.content}</p>
                        <div className="commentActions">
                          <button title="댓글 수정" onClick={() => startEditComment(comment)}><Pencil size={15} />수정</button>
                          <button title="댓글 삭제" onClick={() => onDeleteComment(comment.id)}><Trash2 size={15} />삭제</button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>}
          </div>
        </div>
      </section>
    </div>
  );
}

function loadMediaComments(): MediaComments {
  try {
    const raw = window.localStorage.getItem(MEDIA_COMMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as MediaComments : {};
  } catch {
    return {};
  }
}

function saveMediaComments(comments: MediaComments) {
  try {
    window.localStorage.setItem(MEDIA_COMMENT_STORAGE_KEY, JSON.stringify(comments));
  } catch {
    // 댓글 저장 실패는 사진 보기 흐름을 막지 않는다.
  }
}

function getMediaComments(item: MediaItem, comments: MediaComments): MediaComment[] {
  const saved = comments[item.id] ?? [];
  if (saved.length || !item.comment.trim()) return saved;
  return [{
    id: `legacy-comment-${item.id}`,
    author: "나",
    content: item.comment,
    createdAt: "",
  }];
}

function formatDateTimeKo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}
