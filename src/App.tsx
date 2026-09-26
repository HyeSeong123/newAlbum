import { PhotoView, type PhotoMode } from "./features/media/PhotoWorkspace";
import { useMediaLibrary } from "./features/media/useMediaLibrary";
import { useMediaViewer } from "./features/media/useMediaViewer";
import { useMediaSelection } from "./features/media/useMediaSelection";
import { useMediaComments } from "./features/media/useMediaComments";
import { DetailModal } from "./features/media/PhotoDetail";
import { Memories } from "./features/memories/Memories";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { getMediaComments } from "./features/media/mediaComments";
import { searchMedia, anniversaryMemories } from "./features/media/collectionModel";
import { localDateKey } from "./features/calendar/calendarModel";
import { PeopleWorkspace } from "./features/people/PeopleWorkspace";
import { SavedAlbumsView } from "./features/albums/AlbumsView";
import { AlbumCreateModal } from "./features/albums/AlbumCreateModal";
import { ActionMenu } from "./components/ActionMenu";
import { ChangeEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, FolderOpen, LoaderCircle, Plus, Search, Settings, Upload, X } from "lucide-react";
import { MEDIA_FILE_ACCEPT } from "./features/media/mediaService";
import { filterJournalMonth, journalMonthTitle, resolveJournalMonth } from "./features/media/journalModel";
import type { MediaItem } from "./types/media";

type View = "Library" | "Albums" | "Memories" | "People" | "Settings";

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
  const library = useMediaLibrary();
  const { items, itemsById, albums: savedAlbums, importing, clearing, fileInput, folderInput, chooseFiles, chooseFolder, handleFiles } = library;
  const viewer = useMediaViewer(itemsById, library.recordView);
  const { selected } = viewer;
  const selection = useMediaSelection(itemsById);
  const { enabled: selectionMode, ids: selectedIds, toggle: toggleMediaSelection } = selection;
  const comments = useMediaComments(items, library.patchMedia);
  const { comments: mediaComments, counts: commentCounts } = comments;
  const [albumDraftItems, setAlbumDraftItems] = useState<MediaItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");

  const filtered = useMemo(() => searchMedia(items, query), [items, query]);

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

  async function clearAllRegisteredMedia() {
    if (clearing || !window.confirm("등록 목록을 모두 비울까요? 원본 사진과 영상 파일은 삭제되지 않습니다.")) return;
    if (await library.removeMedia()) { viewer.close(); selection.reset(); }
  }

  function updateSelected(patch: Partial<MediaItem>) {
    if (selected) library.patchMedia(selected.id, patch);
  }

  function toggleSelectionMode() {
    selection.reset(!selectionMode);
    if (!selectionMode) viewer.close();
    setSelectionNotice("");
  }

  function openMedia(item: MediaItem, collection: MediaItem[] = monthItems) {
    if (selectionMode) toggleMediaSelection(item.id);
    else openViewer(item, collection);
  }

  function openViewer(item: MediaItem, collection: MediaItem[] = items) {
    viewer.open(item, collection);
  }

  function navigate(view: View) {
    setActiveView(view); setPhotoMode("grid"); setQuery("");
    selection.reset(); setSelectionNotice("");
  }

  function startAlbum() {
    navigate("Library"); setSelectedMonth("all"); selection.reset(true);
    setSelectionNotice("앨범에 담을 사진과 영상을 선택해 주세요.");
  }

  async function deleteSelectedItems() {
    if (!selectedCount || !window.confirm(`선택한 ${selectedCount}개 항목을 등록 목록에서 지울까요? 원본 파일은 삭제되지 않습니다.`)) return;
    const ids = new Set(selectedIds);
    if (await library.removeMedia(ids)) {
      selection.clear();
      setSelectionNotice(`${ids.size}개 항목을 등록 목록에서 지웠습니다.`);
    }
  }

  async function createAlbumFromSelectedItems(title: string, coverColor: string) {
    const albumItems = albumDraftItems ?? [];
    if (!albumItems.length || !title.trim()) return;
    await library.createAlbum(title.trim(), coverColor, albumItems);
    setSelectionNotice(`'${title.trim()}' 앨범에 ${albumItems.length}개 항목을 담았습니다.`);
    selection.reset();
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
            {activeView === "Albums" && <SavedAlbumsView albums={savedAlbums} query={query} onOpen={openViewer} onSave={library.saveAlbum} onDelete={library.deleteAlbums} />}
            {activeView === "Memories" && <Memories items={visibleMemories} onOpen={(item) => openViewer(item, visibleMemories)} />}
            {activeView === "People" && <PeopleWorkspace items={items} query={query} onOpen={openViewer} onCreateAlbum={setAlbumDraftItems} />}
            {activeView === "Settings" && <SettingsPanel itemCount={items.length} clearing={clearing} onClear={clearAllRegisteredMedia} />}
          </div>
        </section>
        {library.error && <p className="selectionNotice" role="alert">{library.error}</p>}
        {selectionNotice && <p className="selectionNotice" role="status">{selectionNotice}</p>}
        {albumDraftItems && <AlbumCreateModal items={albumDraftItems} onClose={() => setAlbumDraftItems(null)} onCreate={createAlbumFromSelectedItems} />}
        {selected && (
          <DetailModal
            item={selected}
            comments={getMediaComments(selected, mediaComments)}
            onChange={updateSelected}
            onAddComment={(author, content) => comments.add(selected, author, content)}
            commentError={comments.error}
            onUpdateComment={(id, author, content) => comments.edit(selected, id, author, content)}
            onDeleteComment={(id) => comments.remove(selected, id)}
            onClose={viewer.close}
            onPrev={() => viewer.move(-1)}
            onNext={() => viewer.move(1)}
          />
        )}
      </section>
    </main>
  );
}

