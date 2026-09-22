import { Calendar, loadDayNotes } from "./features/calendar/Calendar";
import { PeopleWorkspace } from "./features/people/PeopleWorkspace";
import { SavedAlbumsView, AlbumFullscreenReader } from "./features/albums/AlbumsView";
import { AlbumCreateModal } from "./features/albums/AlbumCreateModal";
import { AlbumCover } from "./features/albums/AlbumCover";
import { ActionMenu } from "./components/ActionMenu";
import { ExportModal } from "./components/ExportModal";
import { EmptyState, getMediaSource, MediaImage, MediaVisual } from "./components/MediaVisual";
import { MediaPlayback } from "./components/MediaPlayback";
import { useModalBehavior } from "./hooks/useModalBehavior";
import { ChangeEvent, FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRowSelection } from "./hooks/useRowSelection";
import { ArrowUpDown, CalendarDays, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Heart, Image, LayoutGrid, LoaderCircle, MessageCircle, Minus, Music, Play, Plus, RotateCcw, Search, Settings, SlidersHorizontal, Star, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { getMediaType, groupByTakenDate, isSupportedMedia, MEDIA_FILE_ACCEPT } from "./features/media/mediaService";
import { arrangeJournalItems, filterJournalMonth, formatJournalDate, journalMonthTitle, mediaSummary, resolveJournalMonth, syncAlbumMedia } from "./features/media/journalModel";
import { PhotoDateNavigation } from "./features/media/PhotoDateNavigation";
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
  incrementMediaView,
  saveMediaDetails,
} from "./services/tauriMediaService";
import type { MediaItem, SavedAlbum } from "./types/media";

type View = "Library" | "Albums" | "Memories" | "People" | "Settings";
type PhotoMode = "grid" | "calendar" | "album";

type MediaComment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};
type MediaComments = Record<string, MediaComment[]>;

const GALLERY_PAGE_SIZE = 48;
type LibrarySort = "date-desc" | "date-asc" | "name" | "comments" | "rating" | "views";
type LibraryMediaType = "all" | "image" | "video" | "audio";

const MEDIA_COMMENT_STORAGE_KEY = "oraedameun.mediaComments";

const viewLabels: Record<View, string> = {
  Library: "사진 기록",
  Albums: "내 앨범",
  Memories: "추억",
  People: "사람과 반려동물",
  Settings: "설정",
};

const navItems: Array<{ name: View; label: string; accessibleLabel: string }> = [
  { name: "Library", label: "사진 기록", accessibleLabel: "사진보기" },
  { name: "Albums", label: "앨범", accessibleLabel: "내 앨범" },
  { name: "People", label: "사람과 반려동물", accessibleLabel: "인물" },
  { name: "Memories", label: "추억", accessibleLabel: "지난 추억" },
];

export function App() {
  const navigationRef = useRef<HTMLElement>(null);
  const [navigationHeight, setNavigationHeight] = useState(70);

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const measure = () => setNavigationHeight(navigation.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, []);

  const [activeView, setActiveView] = useState<View>("Library");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("grid");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [albumRecords, setSavedAlbums] = useState<SavedAlbum[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(() => !isTauriRuntime());
  const [albumDraftItems, setAlbumDraftItems] = useState<MediaItem[] | null>(null);
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
  const previewUrls = useRef(new Set<string>());
  const tauriEnabled = isTauriRuntime();
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const savedAlbums = useMemo(() => syncAlbumMedia(albumRecords, items, mediaLoaded), [albumRecords, items, mediaLoaded]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const haystack = `${item.fileName} ${item.comment} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [items, query]);

  const commentCounts = useMemo(() => Object.fromEntries(items.map((item) => [item.id, getMediaComments(item, mediaComments).length])), [items, mediaComments]);
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayMemories = items.filter((item) => item.takenAt?.slice(5) === todayMonthDay && item.takenAt.slice(0, 4) !== currentYear);
  const visibleMemories = todayMemories.filter((item) => filtered.includes(item));
  const selectedCount = selectedIds.size;
  const activeMonth = resolveJournalMonth(selectedMonth, items);
  const monthItems = useMemo(() => filterJournalMonth(filtered, activeMonth), [filtered, activeMonth]);
  const topbarTitle = activeView === "Library" && photoMode === "grid"
    ? journalMonthTitle(activeMonth)
    : viewLabels[activeView];
  const topbarCount = activeView === "Albums" ? `${savedAlbums.length}개의 앨범` : `${items.length}개의 기록`;

  useEffect(() => {
    if (!tauriEnabled) return;
    loadRegisteredMedia()
      .then((registered) => {
        setItems(registered);
        setMediaLoaded(true);
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

  useEffect(() => {
    const urls = previewUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  useEffect(() => {
    const retained = new Set([...items, ...savedAlbums.flatMap((album) => album.items)].flatMap((item) => item.previewUrl ? [item.previewUrl] : []));
    previewUrls.current.forEach((url) => { if (!retained.has(url)) { URL.revokeObjectURL(url); previewUrls.current.delete(url); } });
  }, [items, savedAlbums]);

  async function registerWithTauri(kind: "files" | "folder") {
    setImporting(kind);
    try {
      const registered = kind === "files" ? await chooseAndRegisterFiles() : await chooseAndRegisterFolder();
      if (!registered.length) return;
      setItems(registered);
      setMediaLoaded(true);
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
    const knownPaths = new Set(items.map((item) => item.filePath));
    const uniqueFiles = accepted.filter((file) => !knownPaths.has(`선택한 로컬 파일/${file.webkitRelativePath || file.name}`));
    const next = uniqueFiles.map<MediaItem>((file, index) => {
      const filePath = `선택한 로컬 파일/${file.webkitRelativePath || file.name}`;
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        id: `local-${Date.now()}-${index}`,
        fileName: file.name,
        filePath,
        fileType: getMediaType(file.name)!,
        takenAt: new Date(file.lastModified).toISOString().slice(0, 10),
        sizeLabel: `${Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB`,
        rating: 0,
        comment: "",
        favorite: false,
        viewCount: 0,
        tags: ["new"],
        thumbnail: "#eae9e1",
        previewUrl,
        metadataStatus: "queued",
      };
    });
    setItems((current) => [...next, ...current]);
    setImporting(null);
  }

  async function clearAllRegisteredMedia() {
    if (clearing) return;
    const confirmed = window.confirm("등록 목록을 모두 비울까요? 원본 사진과 영상 파일은 삭제되지 않습니다.");
    if (!confirmed) return;

    setClearing(true);
    try {
      const remaining = tauriEnabled ? await clearRegisteredMedia() : [];
      setItems(remaining);
      setMediaLoaded(true);
      setSavedAlbums((current) => syncAlbumMedia(current, remaining));
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
    const available = viewerIds.map((id) => itemsById.get(id)).filter((item): item is MediaItem => Boolean(item));
    const index = available.findIndex((item) => item.id === selected.id);
    const next = available[(index + direction + available.length) % available.length];
    if (next) viewMedia(next);
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

  function openMedia(item: MediaItem, collection: MediaItem[] = monthItems) {
    if (selectionMode) {
      toggleMediaSelection(item.id);
      return;
    }
    openViewer(item, collection);
  }

  function openViewer(item: MediaItem, collection: MediaItem[] = items) {
    setViewerIds(collection.map((entry) => entry.id));
    viewMedia(item);
  }

  function navigate(view: View) {
    setActiveView(view); setPhotoMode("grid"); setQuery("");
    setSelectionMode(false); setSelectedIds(new Set()); setSelectionNotice("");
  }

  function startAlbum() {
    navigate("Library"); setSelectedMonth("all"); setSelectionMode(true);
    setSelectionNotice("앨범에 담을 사진과 영상을 선택해 주세요.");
  }

  function viewMedia(item: MediaItem) {
    const current = itemsById.get(item.id) ?? item;
    const viewed = { ...current, viewCount: (current.viewCount ?? 0) + 1 };
    setSelected(viewed);
    setItems((current) => current.map((entry) => entry.id === item.id ? viewed : entry));
    if (tauriEnabled) void incrementMediaView(item.id).catch((error) => console.error("조회수를 저장하지 못했습니다.", error));
  }

  async function deleteSelectedItems() {
    if (!selectedCount) return;
    const confirmed = window.confirm(`선택한 ${selectedCount}개 항목을 등록 목록에서 지울까요? 원본 파일은 삭제되지 않습니다.`);
    if (!confirmed) return;

    const ids = [...selectedIds];
    try {
      const remaining = tauriEnabled ? await deleteRegisteredMedia(ids) : items.filter((item) => !selectedIds.has(item.id));
      setItems(remaining);
      setMediaLoaded(true);
      setSavedAlbums((current) => syncAlbumMedia(current, remaining));
      setSelectedIds(new Set());
      setSelectionNotice(`${ids.length}개 항목을 등록 목록에서 지웠습니다.`);
    } catch (error) {
      console.error("선택한 항목을 삭제하지 못했습니다.", error);
    }
  }

  async function createAlbumFromSelectedItems(title: string, coverColor: string) {
    const albumItems = albumDraftItems ?? [];
    if (!albumItems.length) return;
    if (!title?.trim()) return;

    try {
      if (tauriEnabled) {
        await createAlbumFromMedia(title.trim(), albumItems.map((item) => item.id), coverColor);
        setSavedAlbums(await loadSavedAlbums());
      } else {
        setSavedAlbums((current) => [
          {
            id: `local-album-${Date.now()}`,
            title: title.trim(),
            description: "",
            createdAt: new Date().toISOString(),
            coverColor,
            items: albumItems,
          },
          ...current,
        ]);
      }
      setSelectionNotice(`'${title.trim()}' 앨범에 ${albumItems.length}개 항목을 담았습니다.`);
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("앨범을 만들지 못했습니다.", error);
      throw error;
    }
  }

  return (
    <main className="app" style={{ "--app-header-height": `${navigationHeight}px` } as CSSProperties}>
      <header ref={navigationRef} className="sidebar" aria-label="주 메뉴">
        <div className="brand">
          <strong>오래담은</strong>
          <span>Warm Journal</span>
        </div>

        <nav className="navList" aria-label="주 메뉴">
          {navItems.map(({ name, label, accessibleLabel }) => (
            <button
              key={name}
              className={activeView === name ? "active" : ""}
              onClick={() => navigate(name)}
              aria-pressed={activeView === name}
              aria-label={accessibleLabel}
              title={accessibleLabel}
            >
              <span>{label}</span>
              {name === "Memories" && todayMemories.length > 0 && (
                <strong className="navCount" aria-label={`${todayMemories.length}개`}>{todayMemories.length}</strong>
              )}
            </button>
          ))}
        </nav>
        <button className="globalSettings" aria-label="설정" title="설정" aria-pressed={activeView === "Settings"} onClick={() => navigate("Settings")}><Settings size={20} /></button>
      </header>

      <section className="workspace">
        <header className={`topbar view-${activeView.toLowerCase()}`}>
          <div>
            <h1 aria-label={activeView === "Library" ? "사진보기" : viewLabels[activeView]}>{topbarTitle}</h1>
            <span className="collectionCount">{topbarCount}</span>
          </div>
          <div className="toolbar">
            <label className="searchBox">
              <Search size={18} />
              <input aria-label={activeView === "People" ? "이름 검색" : activeView === "Albums" ? "앨범 검색" : "사진과 추억 검색"} value={query} onChange={(event) => { setQuery(event.target.value); if (activeView === "Library" && activeMonth !== "favorites") setSelectedMonth("all"); }} placeholder={activeView === "People" ? "이름 검색" : activeView === "Albums" ? "앨범을 검색하세요" : "사진과 추억을 검색하세요"} />
              {query && <button className="searchClear" aria-label="검색 지우기" onClick={() => setQuery("")}><X size={15} /></button>}
            </label>
            <div className="importActions">
              <button className="primary" onClick={activeView === "Albums" ? startAlbum : chooseFiles} disabled={Boolean(importing)}>
                {importing ? <LoaderCircle className="spinIcon" size={18} /> : <Plus size={18} />}
                {importing === "files" ? "가져오는 중" : activeView === "Albums" ? "새 앨범" : "가져오기"}
              </button>
              {activeView !== "Albums" && <ActionMenu label="가져오기 옵션" icon={<ChevronDown size={16} />} disabled={Boolean(importing)} actions={[
                { label: "파일 선택", icon: <Upload size={16} />, onSelect: chooseFiles },
                { label: "폴더 선택", icon: <FolderOpen size={16} />, onSelect: chooseFolder },
              ]} />}
              {importing && (
                <div className="importStatus" role="status" aria-live="polite">
                  <LoaderCircle className="spinIcon" size={18} />
                  <span>{importing === "folder" ? "폴더 안의 사진과 영상을 살펴보고 있어요." : "선택한 파일을 앨범에 담고 있어요."}</span>
                </div>
              )}
            </div>
            <input ref={fileInput} type="file" accept={MEDIA_FILE_ACCEPT} multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { handleFiles(event.target.files, "files"); event.currentTarget.value = ""; }} hidden />
            <input
              ref={folderInput}
              type="file"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => { handleFiles(event.target.files, "folder"); event.currentTarget.value = ""; }}
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
                allItems={items}
                activeMonth={activeMonth}
                onMonthChange={setSelectedMonth}
                selected={selected}
                onOpen={openMedia}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelection={toggleMediaSelection}
                onToggleSelectionMode={toggleSelectionMode}
                selectedCount={selectedCount}
                commentCounts={commentCounts}
                onCreateAlbum={() => setAlbumDraftItems(items.filter((item) => selectedIds.has(item.id)))}
                onDeleteSelected={deleteSelectedItems}
                albums={savedAlbums}
                onShowAlbums={() => navigate("Albums")}
                onNewAlbum={startAlbum}
                onViewMedia={openViewer}
                scopeKey={`${activeMonth}:${query}`}
              />
            )}
            {activeView === "Albums" && <SavedAlbumsView albums={savedAlbums} query={query} onOpen={openViewer} onSave={async (album) => {
              if (tauriEnabled) await saveAlbum(album);
              setSavedAlbums((current) => current.map((entry) => entry.id === album.id ? album : entry));
            }} onDelete={async (ids) => {
              if (tauriEnabled) await deleteAlbums(ids);
              setSavedAlbums((current) => current.filter((album) => !ids.includes(album.id)));
            }} />}
            {activeView === "Memories" && <Memories items={visibleMemories} onOpen={(item) => openViewer(item, visibleMemories)} />}
            {activeView === "People" && <PeopleWorkspace items={items} query={query} onOpen={openViewer} onCreateAlbum={setAlbumDraftItems} />}
            {activeView === "Settings" && <SettingsPanel itemCount={items.length} clearing={clearing} onClear={clearAllRegisteredMedia} />}
          </div>
        </section>
        {selectionNotice && <p className="selectionNotice" role="status">{selectionNotice}</p>}
        {albumDraftItems && <AlbumCreateModal items={albumDraftItems} onClose={() => setAlbumDraftItems(null)} onCreate={createAlbumFromSelectedItems} />}
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
  mode, setMode, items, allItems, activeMonth, onMonthChange, selected, onOpen,
  selectionMode, selectedIds, onToggleSelection, onToggleSelectionMode,
  selectedCount, commentCounts, onCreateAlbum, onDeleteSelected, albums,
  onShowAlbums, onNewAlbum, onViewMedia, scopeKey,
}: {
  mode: PhotoMode;
  setMode: (mode: PhotoMode) => void;
  items: MediaItem[];
  allItems: MediaItem[];
  activeMonth: string;
  onMonthChange: (month: string) => void;
  selected: MediaItem | null;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  commentCounts: Record<string, number>;
  onCreateAlbum: () => void;
  onDeleteSelected: () => void;
  albums: SavedAlbum[];
  onShowAlbums: () => void;
  onNewAlbum: () => void;
  onViewMedia: (item: MediaItem, collection?: MediaItem[]) => void;
  scopeKey: string;
}) {
  const [quickAlbumId, setQuickAlbumId] = useState<string | null>(null);
  const [exportingQuickAlbum, setExportingQuickAlbum] = useState(false);
  const quickAlbum = albums.find((album) => album.id === quickAlbumId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const monthItems = filterJournalMonth(items, activeMonth);
  const tabs = [
    { mode: "grid" as const, label: "그리드", Icon: LayoutGrid },
    { mode: "calendar" as const, label: "달력", Icon: CalendarDays },
    { mode: "album" as const, label: "전체 앨범", Icon: Image },
  ];
  const viewTabs = <div className="viewTabs" role="tablist" aria-label="사진 보기 방식">
      {tabs.map((tab, index) => <button key={tab.mode} ref={(node) => { tabRefs.current[index] = node; }} id={`photo-tab-${tab.mode}`} role="tab" aria-selected={mode === tab.mode} aria-controls={`photo-panel-${tab.mode}`} tabIndex={mode === tab.mode ? 0 : -1} className={mode === tab.mode ? "active" : ""} onClick={() => setMode(tab.mode)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
        setMode(tabs[next].mode);
        requestAnimationFrame(() => tabRefs.current[next]?.focus());
      }}><tab.Icon size={16} />{tab.label}</button>)}
    </div>;
  return <div className={`photoWorkspace mode-${mode}`}>
    {mode === "grid" && <PhotoDateNavigation items={allItems} activeMonth={activeMonth} onChange={onMonthChange} />}
    {mode !== "grid" && viewTabs}
    {mode === "grid" && <Library
      viewTabs={viewTabs}
      items={monthItems} selected={selected} onOpen={onOpen} selectionMode={selectionMode}
      selectedIds={selectedIds} onToggleSelection={onToggleSelection}
      onToggleSelectionMode={onToggleSelectionMode} selectedCount={selectedCount}
      commentCounts={commentCounts} onCreateAlbum={onCreateAlbum} onDeleteSelected={onDeleteSelected}
      scopeKey={scopeKey} emptyText={allItems.length ? "조건에 맞는 기록이 없습니다. 다른 월을 선택하거나 검색을 바꿔보세요." : "가져오기로 첫 사진과 영상을 담아보세요."}
    />}
    {mode === "grid" && <aside className="quickAlbums" aria-label="내 앨범 미리보기">
      <header><h2>내 앨범</h2><button title="새 앨범" onClick={onNewAlbum}><Plus size={17} /></button></header>
      {albums.slice(0, 2).map((album) => <button className="quickAlbum" key={album.id} onClick={() => setQuickAlbumId(album.id)} aria-label={`${album.title} 앨범 열기`}>
        <AlbumCover title={album.title} items={album.items} color={album.coverColor} />
        <span className="quickAlbumMeta">{mediaSummary(album.items)}</span>
      </button>)}
      {!albums.length && <div className="quickAlbumEmpty"><p>함께 기억하고 싶은 순간을<br />한 권의 앨범에 담아보세요.</p><button onClick={onNewAlbum}><Plus size={15} />첫 앨범 만들기</button></div>}
      {albums.length > 0 && <button className="showAllAlbums" onClick={onShowAlbums}>모두 보기 <ChevronRight size={16} /></button>}
    </aside>}
    {mode === "calendar" && <div className="calendarTabPanel" id="photo-panel-calendar" role="tabpanel" aria-labelledby="photo-tab-calendar"><Calendar items={items} initialMonth={/^\d{4}-\d{2}$/.test(activeMonth) ? activeMonth : undefined} onOpen={(item) => onViewMedia(item, items)} /></div>}
    {mode === "album" && <div id="photo-panel-album" role="tabpanel" aria-labelledby="photo-tab-album"><AlbumFullscreenReader title="모든 기록" items={items} open={true} backLabel="사진 기록" onOpen={onViewMedia} onClose={() => setMode("grid")} /></div>}
    {quickAlbum && <AlbumFullscreenReader title={quickAlbum.title} items={quickAlbum.items} color={quickAlbum.coverColor} open={true} backLabel="사진 기록" onOpen={onViewMedia} onClose={() => { setQuickAlbumId(null); setExportingQuickAlbum(false); }} onExport={() => setExportingQuickAlbum(true)} />}
    {quickAlbum && exportingQuickAlbum && <ExportModal title={quickAlbum.title} items={quickAlbum.items} onClose={() => setExportingQuickAlbum(false)} />}
  </div>;
}

function Library({
  viewTabs,
  items,
  selected,
  onOpen,
  selectionMode,
  selectedIds,
  onToggleSelection,
  onToggleSelectionMode,
  selectedCount,
  commentCounts,
  onCreateAlbum,
  onDeleteSelected,
  scopeKey,
  emptyText,
}: {
  viewTabs: ReactNode;
  items: MediaItem[];
  selected: MediaItem | null;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  commentCounts: Record<string, number>;
  onCreateAlbum: () => void;
  onDeleteSelected: () => void;
  scopeKey: string;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LibrarySort>("date-desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mediaType, setMediaType] = useState<LibraryMediaType>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [minimumRating, setMinimumRating] = useState(0);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());
  const [dayNotes] = useState(loadDayNotes);
  const dragSelection = useRowSelection(selectionMode, onToggleSelection, (id) => selectedIds.has(id));
  const visibleCollection = useMemo(() => {
    const result = items.filter((item) => (
      (mediaType === "all" || item.fileType === mediaType)
      && (!favoritesOnly || item.favorite)
      && (!commentsOnly || (commentCounts[item.id] ?? 0) > 0)
      && item.rating >= minimumRating
    ));
    return result.sort((a, b) => {
      if (sort === "date-desc") return (b.takenAt ?? "").localeCompare(a.takenAt ?? "") || b.id.localeCompare(a.id, undefined, { numeric: true });
      if (sort === "date-asc") return (a.takenAt ?? "9999").localeCompare(b.takenAt ?? "9999") || a.id.localeCompare(b.id, undefined, { numeric: true });
      if (sort === "name") return a.fileName.localeCompare(b.fileName, "ko", { numeric: true });
      if (sort === "comments") return (commentCounts[b.id] ?? 0) - (commentCounts[a.id] ?? 0) || (b.takenAt ?? "").localeCompare(a.takenAt ?? "");
      if (sort === "rating") return b.rating - a.rating || (b.takenAt ?? "").localeCompare(a.takenAt ?? "");
      return (b.viewCount ?? 0) - (a.viewCount ?? 0) || (b.takenAt ?? "").localeCompare(a.takenAt ?? "");
    });
  }, [items, mediaType, favoritesOnly, commentsOnly, minimumRating, sort, commentCounts]);
  const activeFilterCount = Number(mediaType !== "all") + Number(favoritesOnly) + Number(commentsOnly) + Number(minimumRating > 0);
  const pageCount = Math.max(1, Math.ceil(visibleCollection.length / GALLERY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * GALLERY_PAGE_SIZE;
  const visibleItems = visibleCollection.slice(startIndex, startIndex + GALLERY_PAGE_SIZE);
  const rangeStart = visibleCollection.length ? startIndex + 1 : 0;
  const rangeEnd = Math.min(startIndex + GALLERY_PAGE_SIZE, visibleCollection.length);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => { setPage(1); setExpandedDates(new Set()); }, [sort, mediaType, favoritesOnly, commentsOnly, minimumRating, scopeKey]);

  function clearFilters() {
    setMediaType("all"); setFavoritesOnly(false); setCommentsOnly(false); setMinimumRating(0);
  }

  return (
    <div className="libraryView">
      <div className="panelHeader collectionTools">
        {viewTabs}
        <div className="panelActions">
          <button className={selectionMode ? "selectionToggle activeAction" : "selectionToggle"} aria-pressed={selectionMode} onClick={onToggleSelectionMode}>
            {selectionMode ? <X size={17} /> : <CheckSquare size={17} />}
            {selectionMode ? "선택 끝내기" : "사진 선택"}
          </button>
          <label className="sortControl"><ArrowUpDown size={17} /><select aria-label="정렬 기준" value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="date-desc">날짜 최신순</option><option value="date-asc">날짜 오래된순</option><option value="comments">댓글 많은순</option><option value="rating">별점 높은순</option><option value="views">조회수 많은순</option><option value="name">이름순</option>
          </select></label>
          <button className={activeFilterCount ? "iconText filterActive" : "iconText"} aria-expanded={filtersOpen} aria-controls="libraryFilters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17} />필터{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>
        </div>
      </div>
      <section id="photo-panel-grid" role="tabpanel" aria-labelledby="photo-tab-grid">
      {filtersOpen && <section id="libraryFilters" className="filterPanel" aria-label="사진 필터">
        <label>종류<select aria-label="미디어 종류" value={mediaType} onChange={(event) => setMediaType(event.target.value as LibraryMediaType)}><option value="all">전체</option><option value="image">사진</option><option value="video">영상</option><option value="audio">음원</option></select></label>
        <label>최소 별점<select aria-label="최소 별점" value={minimumRating} onChange={(event) => setMinimumRating(Number(event.target.value))}><option value="0">전체</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}점 이상</option>)}</select></label>
        <label className="filterCheck"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />즐겨찾기만</label>
        <label className="filterCheck"><input type="checkbox" checked={commentsOnly} onChange={(event) => setCommentsOnly(event.target.checked)} />댓글 있는 사진만</label>
        <span className="filterResult">{visibleCollection.length}장</span>
        <button className="iconText" disabled={!activeFilterCount} onClick={clearFilters}><X size={16} />초기화</button>
      </section>}
      {selectionMode && (
        <div className="selectionDock" aria-label={`${selectedCount}장 선택됨`}>
          <strong aria-live="polite">{selectedCount}개 선택</strong>
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
      {!items.length && <EmptyState text={emptyText} />}
      {Boolean(items.length) && !visibleCollection.length && <EmptyState text="조건에 맞는 사진과 영상이 없습니다." />}
      <div className={selectionMode ? "galleryGrid selecting" : "galleryGrid"} {...dragSelection}>
        {Object.entries(groupByTakenDate(visibleItems)).map(([date, datedItems], dayIndex) => {
          const arrangedItems = arrangeJournalItems(datedItems);
          const expanded = selectionMode || expandedDates.has(date);
          const displayedItems = expanded ? arrangedItems : arrangedItems.slice(0, 3);
          const note = dayNotes[date] || arrangedItems.find((item) => item.comment.trim())?.comment;
          return <section className="journalDay" key={date}>
          <header className="journalDayHeader"><h2>{formatJournalDate(date, scopeKey.startsWith("all:"))}</h2><span>{mediaSummary(datedItems)}</span></header>
          <div className={`journalMosaic count-${Math.min(displayedItems.length, 4)} ${dayIndex > 0 ? "compact" : ""}`}>{displayedItems.map((item, index) => (
          <button
            key={item.id}
            data-media-id={item.id}
            data-selection-id={item.id}
            className={[
              "mediaTile",
              index === 0 ? "featured" : "",
              (item.height ?? 0) > (item.width ?? 0) ? "portrait" : "landscape",
              selected?.id === item.id ? "selected" : "",
              selectedIds.has(item.id) ? "multiSelected" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => onOpen(item, visibleCollection)}
            aria-label={`${item.fileName} ${selectionMode ? "선택" : "상세보기"}`}
            aria-pressed={selectionMode ? selectedIds.has(item.id) : undefined}
          >
            <MediaVisual item={item} className="thumb">
              {item.fileType === "video" && <span className="videoDuration"><Play size={12} fill="currentColor" />{item.duration || "영상"}</span>}
              {item.fileType === "audio" && <Music className="mediaBadge" size={24} />}
              {item.favorite && <Heart className="fav" size={17} fill="currentColor" />}
              {selectionMode && (
                <span className="selectMark" aria-label={selectedIds.has(item.id) ? "선택됨" : "선택 안 됨"}>
                </span>
              )}
            </MediaVisual>
            <small className="mediaDate">{item.takenAt ?? "날짜 없음"}</small>
          </button>
          ))}</div>
          {note && <p className="journalCaption">{note}</p>}
          {arrangedItems.length > 3 && !selectionMode && <button className="journalMore" aria-expanded={expanded} onClick={() => setExpandedDates((current) => {
            const next = new Set(current);
            if (expanded) next.delete(date); else next.add(date);
            return next;
          })}>{expanded ? "접기" : `기록 ${arrangedItems.length - 3}개 더보기`}<ChevronRight size={16} /></button>}
        </section>})}
      </div>
      {visibleCollection.length > GALLERY_PAGE_SIZE && (
        <nav className="pagination" aria-label="모아보기 페이지">
          <span>{rangeStart}-{rangeEnd} / {visibleCollection.length}장</span>
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
      </section>
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
  const [zoomViewerOpen, setZoomViewerOpen] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(100);
  const dialogRef = useRef<HTMLElement>(null);
  const photoViewportRef = useRef<HTMLDivElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const previousZoom = useRef(100);
  const photoDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingAuthor, setEditingAuthor] = useState("");
  const [editingContent, setEditingContent] = useState("");
  useModalBehavior(onClose, { onPrev, onNext });

  useEffect(() => {
    setCommentContent("");
    setEditingCommentId(null);
    setEditingAuthor("");
    setEditingContent("");
    setZoomViewerOpen(false);
    setPhotoZoom(100);
    photoDrag.current = null;
  }, [item.id]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  useLayoutEffect(() => {
    const viewport = photoViewportRef.current;
    if (viewport) {
      // Keep the same part of the photo centered when the zoom level changes.
      const ratio = Math.max(100, photoZoom) / Math.max(100, previousZoom.current);
      viewport.scrollLeft = (viewport.scrollLeft + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2;
      viewport.scrollTop = (viewport.scrollTop + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2;
    }
    previousZoom.current = photoZoom;
  }, [photoZoom]);

  function changePhotoZoom(value: number) {
    setPhotoZoom(Math.max(25, Math.min(400, value)));
  }

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
      <section ref={dialogRef} className="detailModal photoLightbox photoInspector" role="dialog" aria-modal="true" aria-label="사진 상세" tabIndex={-1} inert={zoomViewerOpen} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, video[controls], audio[controls]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}>
        <header className="detailHeader">
          <button className="detailBack" onClick={onClose} aria-label="사진 기록으로 돌아가기"><ChevronLeft size={20} /><span id="detailTitle">사진 기록</span></button>
          <span className="detailDateTitle">{formatJournalDate(item.takenAt)}</span>
          <button className="detailClose" title="닫기" onClick={onClose}><X size={18} /><span>닫기</span></button>
        </header>
        <div className="detailLayout">
          <aside className="photoInformation" aria-label="사진 정보">
            <h2>{item.fileType === "image" ? "사진 정보" : item.fileType === "video" ? "영상 정보" : "음성 정보"}</h2>
            <p className="detailFileName">{item.fileName}</p>
            <button className={item.favorite ? "detailFavorite active" : "detailFavorite"} title="즐겨찾기" aria-pressed={item.favorite} onClick={() => onChange({ favorite: !item.favorite })}>
              <Heart size={24} fill={item.favorite ? "currentColor" : "none"} /><span>즐겨찾기</span>
            </button>
            <section className="detailRating" aria-label="별점">
              <h3>별점</h3>
              <div className="rating">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} onClick={() => onChange({ rating: score })} title={`${score}점`} aria-pressed={item.rating === score}>
                    <Star size={28} fill={score <= item.rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </section>
            <dl className="photoMetadata">
              <div><dt>촬영일</dt><dd>{item.takenAt?.replaceAll("-", ".") ?? "날짜 없음"}</dd></div>
              <div><dt>해상도</dt><dd>{item.width && item.height ? `${item.width} × ${item.height}` : "-"}</dd></div>
              {item.fileType !== "image" && <div><dt>재생 시간</dt><dd>{item.duration || "-"}</dd></div>}
              <div><dt>파일 크기</dt><dd>{item.sizeLabel}</dd></div>
              <div><dt>조회 수</dt><dd>{item.viewCount ?? 0}회</dd></div>
            </dl>
          </aside>
          <div className="detailPhotoPane">
            <div className="detailStage">
              {item.fileType === "image" ? <>
                <div
                  key={item.id}
                  ref={photoViewportRef}
                  className={`detailImageViewport${photoZoom > 100 ? " canPan" : ""}`}
                  onPointerDown={(event) => {
                    if (photoZoom <= 100 || event.button !== 0) return;
                    const viewport = event.currentTarget;
                    photoDrag.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
                    viewport.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const origin = photoDrag.current;
                    if (!origin) return;
                    event.currentTarget.scrollLeft = origin.left - (event.clientX - origin.x);
                    event.currentTarget.scrollTop = origin.top - (event.clientY - origin.y);
                  }}
                  onPointerUp={(event) => {
                    photoDrag.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { photoDrag.current = null; }}
                  onLostPointerCapture={() => { photoDrag.current = null; }}
                >
                  <div className="detailImageCanvas" style={{ width: `${Math.max(100, photoZoom)}%`, height: `${Math.max(100, photoZoom)}%`, "--photo-scale": Math.min(1, photoZoom / 100) } as CSSProperties}>
                    <MediaImage item={item} original />
                  </div>
                </div>
                <button ref={zoomTriggerRef} className="detailExpand" title="확대 보기" onClick={() => setZoomViewerOpen(true)}><ZoomIn size={21} /><span>확대 보기</span></button>
              </> : <MediaPlayback key={`${item.id}:${item.filePath}:${item.previewUrl ?? ""}`} kind={item.fileType} fileName={item.fileName} source={getMediaSource(item)} />}
              <button className="photoNavButton prev" title="이전" onClick={onPrev}><ChevronLeft size={22} /></button>
              <button className="photoNavButton next" title="다음" onClick={onNext}><ChevronRight size={22} /></button>
            </div>
            {item.fileType === "image" && <div className="detailZoomControls" aria-label="사진 배율 조절">
              <button title="축소" aria-label="축소" disabled={photoZoom <= 25} onClick={() => changePhotoZoom(photoZoom - 25)}><Minus size={22} /></button>
              <input aria-label="사진 배율" type="range" min="25" max="400" step="25" value={photoZoom} onChange={(event) => changePhotoZoom(Number(event.target.value))} />
              <output aria-live="polite">{photoZoom}%</output>
              <button title="확대" aria-label="확대" disabled={photoZoom >= 400} onClick={() => changePhotoZoom(photoZoom + 25)}><Plus size={22} /></button>
              <button className="detailZoomReset" title="100%로 복원" onClick={() => setPhotoZoom(100)}><RotateCcw size={20} /><span>복원</span></button>
            </div>}
          </div>
          <aside className="detailBody" aria-label="댓글">
            <section id="photoComments" className="commentBox">
              <h2><MessageCircle size={25} /><span>댓글 {comments.length}</span></h2>
              <div className="commentList">
                {!comments.length && <p>아직 남긴 댓글이 없습니다.</p>}
                {comments.map((comment) => (
                  <article key={comment.id} className="commentItem">
                    {editingCommentId === comment.id ? (
                      <form className="commentEditForm" onSubmit={submitEditedComment}>
                        <label>
                          <span>작성자</span>
                          <input value={editingAuthor} onChange={(event) => setEditingAuthor(event.target.value)} placeholder="이름" />
                        </label>
                        <label>
                          <span>내용</span>
                          <textarea value={editingContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEditingContent(event.target.value)} placeholder="이 사진에 대한 이야기를 남겨보세요." />
                        </label>
                        <div className="commentEditActions">
                          <button type="submit" disabled={!editingAuthor.trim() || !editingContent.trim()}><CheckSquare size={16} />저장</button>
                          <button type="button" onClick={cancelEditComment}><X size={16} />취소</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="commentAvatar" aria-hidden="true">{Array.from(comment.author.trim())[0] || "나"}</span>
                        <div className="commentItemHeading">
                          <strong>{comment.author}</strong>
                          {comment.createdAt && <time dateTime={comment.createdAt}>{formatDateTimeKo(comment.createdAt)}</time>}
                          <div className="commentActions">
                            <button title="댓글 수정" onClick={() => startEditComment(comment)}>수정</button>
                            <button title="댓글 삭제" onClick={() => onDeleteComment(comment.id)}>삭제</button>
                          </div>
                        </div>
                        <p>{comment.content}</p>
                      </>
                    )}
                  </article>
                ))}
              </div>
              <form className="commentForm" onSubmit={submitComment}>
                <label>
                  <span>작성자</span>
                  <input value={commentAuthor} onChange={(event) => setCommentAuthor(event.target.value)} placeholder="이름" />
                </label>
                <label>
                  <span>내용</span>
                  <textarea value={commentContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCommentContent(event.target.value)} placeholder="이 사진에 대한 이야기를 남겨보세요." />
                </label>
                <button type="submit" disabled={!commentAuthor.trim() || !commentContent.trim()}>댓글 등록</button>
              </form>
            </section>
          </aside>
        </div>
      </section>
      {zoomViewerOpen && <PhotoZoomViewer item={item} onClose={() => { setZoomViewerOpen(false); requestAnimationFrame(() => zoomTriggerRef.current?.focus()); }} />}
    </div>
  );
}

function PhotoZoomViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  useModalBehavior(onClose);

  function changeScale(next: number) {
    setScale(Math.min(4, Math.max(1, Math.round(next * 10) / 10)));
  }

  return (
    <div className="photoZoomBackdrop" role="presentation">
      <section className="photoZoomViewer" role="dialog" aria-modal="true" aria-label="사진 확대 보기">
        <div className="photoZoomToolbar" aria-label="확대 배율 조절">
          <button title="축소" onClick={() => changeScale(scale - 0.25)} disabled={scale <= 1}><ZoomOut size={20} /></button>
          <input aria-label="확대 배율" type="range" min="1" max="4" step="0.1" value={scale} onChange={(event) => changeScale(Number(event.target.value))} />
          <output>{Math.round(scale * 100)}%</output>
          <button title="확대" onClick={() => changeScale(scale + 0.25)} disabled={scale >= 4}><ZoomIn size={20} /></button>
          <button title="100%로 복원" onClick={() => setScale(1)}><RotateCcw size={19} /></button>
          <button className="photoZoomClose" title="확대 보기 닫기" autoFocus onClick={onClose}><X size={20} /></button>
        </div>
        <div className="photoZoomStage">
          <button
            className="photoZoomCanvas"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
            title={scale < 4 ? "사진 확대" : "최대 배율"}
            onClick={() => changeScale(scale + 0.5)}
          >
            <MediaImage item={item} original />
          </button>
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
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
