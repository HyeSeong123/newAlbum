import { Library } from "./features/media/LibraryView";
import { DetailModal } from "./features/media/PhotoDetail";
import { Memories } from "./features/memories/Memories";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { loadMediaComments, saveMediaComments, getMediaComments, type MediaComment, type MediaComments } from "./features/media/mediaComments";
import { searchMedia, anniversaryMemories } from "./features/media/collectionModel";
import { localDateKey } from "./features/calendar/calendarModel";
import { Calendar } from "./features/calendar/Calendar";
import { PeopleWorkspace } from "./features/people/PeopleWorkspace";
import { SavedAlbumsView, AlbumFullscreenReader } from "./features/albums/AlbumsView";
import { AlbumCreateModal } from "./features/albums/AlbumCreateModal";
import { AlbumCover } from "./features/albums/AlbumCover";
import { ActionMenu } from "./components/ActionMenu";
import { ExportModal } from "./components/ExportModal";
import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronDown, ChevronRight, FolderOpen, Image, LayoutGrid, LoaderCircle, Plus, Search, Settings, Upload, X } from "lucide-react";
import { getMediaType, isSupportedMedia, MEDIA_FILE_ACCEPT } from "./features/media/mediaService";
import { filterJournalMonth, journalMonthTitle, mediaSummary, resolveJournalMonth, syncAlbumMedia } from "./features/media/journalModel";
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

  const filtered = useMemo(() => searchMedia(items, query), [items, query]);

  const commentCounts = useMemo(() => Object.fromEntries(items.map((item) => [item.id, getMediaComments(item, mediaComments).length])), [items, mediaComments]);
  const today = localDateKey(new Date());
  const todayMemories = useMemo(() => anniversaryMemories(items, today), [items, today]);
  const visibleMemories = useMemo(() => anniversaryMemories(filtered, today), [filtered, today]);
  const selectedCount = selectedIds.size;
  const activeMonth = useMemo(() => resolveJournalMonth(selectedMonth, items), [selectedMonth, items]);
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

