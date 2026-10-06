import { PhotoView, type PhotoMode } from "./features/media/PhotoWorkspace";
import { useMediaLibrary } from "./features/media/useMediaLibrary";
import { useMediaViewer } from "./features/media/useMediaViewer";
import { useMediaSelection } from "./features/media/useMediaSelection";
import { useMediaCommentCounts } from "./features/media/useMediaComments";
import { DetailModal } from "./features/media/PhotoDetail";
import { MemoriesWorkspace } from "./features/memories/MemoriesWorkspace";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { searchMedia } from "./features/media/collectionModel";
import { memoryGroups } from "./features/memories/memoriesModel";
import { localDateKey } from "./features/calendar/calendarModel";
import { PeopleWorkspace } from "./features/people/PeopleWorkspace";
import { SavedAlbumsView } from "./features/albums/AlbumsView";
import { AlbumCreateModal } from "./features/albums/AlbumCreateModal";
import type { CalendarRegistrationOptions } from "./features/calendar/calendarModel";
import { MediaImportModal } from "./features/media/MediaImportModal";
import { MediaImportProgress } from "./features/media/MediaImportProgress";
import { useAndroidBack } from "./hooks/useAndroidBack";
import { FirstRunGuide, FIRST_RUN_KEY } from "./components/FirstRunGuide";
import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LoaderCircle, Plus, Search, Settings, X } from "lucide-react";
import { MEDIA_FILE_ACCEPT } from "./features/media/mediaService";
import { filterJournalMonth, journalMonthTitle, resolveJournalMonth } from "./features/media/journalModel";
import type { MediaItem } from "./types/media";
import { DiaryView, useDiary } from "./features/diary/DiaryView";
import { BrandLogo } from "./components/BrandLogo";
import { MainNavigation } from "./components/MainNavigation";
import { HomeView } from "./features/home/HomeView";
import { CharacterBook } from "./features/characters/CharacterBook";
import { CharacterEventModal } from "./features/characters/CharacterEventModal";
import { useCharacters } from "./features/characters/useCharacters";
import { GomiGuide } from "./features/characters/GomiGuide";
import type { GuideTopic } from "./features/characters/guideTopics";

type View = "Home" | "Library" | "Albums" | "Memories" | "People" | "Diary" | "Characters" | "Settings";

const viewLabels: Record<View, string> = {
  Home: "홈",
  Library: "사진 기록",
  Albums: "내 앨범",
  Memories: "추억",
  People: "사람과 반려동물",
  Diary: "일기장",
  Characters: "새싹 도감",
  Settings: "설정",
};

const navItems: Array<{ name: View; label: string; accessibleLabel: string }> = [
  { name: "Home", label: "홈", accessibleLabel: "홈" },
  { name: "Library", label: "사진 기록", accessibleLabel: "사진 기록" },
  { name: "Albums", label: "내 앨범", accessibleLabel: "내 앨범" },
  { name: "Diary", label: "일기장", accessibleLabel: "일기장" },
  { name: "Memories", label: "추억", accessibleLabel: "추억" },
  { name: "Characters", label: "새싹 도감", accessibleLabel: "새싹 도감" },
  { name: "People", label: "사람과 반려동물", accessibleLabel: "사람과 반려동물" },
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

  const [activeView, setActiveView] = useState<View>("Home");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("grid");
  const [memorySection, setMemorySection] = useState<"rediscover" | "timeline" | "map">("rediscover");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const library = useMediaLibrary();
  const diary = useDiary();
  const [largeLayout, setLargeLayout] = useState(() => localStorage.getItem("warm-journal-large-layout") === "true");
  const [importOpen, setImportOpen] = useState(false);
  const { items, itemsById, albums: savedAlbums, importing, clearing, fileInput, folderInput } = library;
  const characters = useCharacters(items.map(item => `${item.id}:${item.gpsRegionCode || ""}`).join("|"));
  const mainCharacter = characters.snapshot.characters.find(character => character.isMain);
  const pendingCharacterEvent = characters.snapshot.events[0];
  const viewer = useMediaViewer(itemsById, library.recordView);
  const { selected } = viewer;
  const selection = useMediaSelection(itemsById);
  const { enabled: selectionMode, ids: selectedIds, toggle: toggleMediaSelection } = selection;
  const commentCounts = useMediaCommentCounts(items);
  const [albumDraftItems, setAlbumDraftItems] = useState<MediaItem[] | null>(null);
  const [albumDraftTitle, setAlbumDraftTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [guideTopic, setGuideTopic] = useState<GuideTopic | null>(null);
  const [peopleTab, setPeopleTab] = useState<"people" | "pets">("people");
  const currentGuideTopic: GuideTopic = activeView === "People" ? peopleTab : ({ Library: "photos", Albums: "albums", Diary: "diary", Memories: "memories", Characters: "characters" } as Partial<Record<View, GuideTopic>>)[activeView] || "photos";

  useEffect(() => {
    if (!library.loaded || !diary.loaded || localStorage.getItem(FIRST_RUN_KEY)) return;
    if (items.length || savedAlbums.length || diary.entries.length) localStorage.setItem(FIRST_RUN_KEY, "true");
    else setFirstRunOpen(true);
  }, [library.loaded, diary.loaded, items.length, savedAlbums.length, diary.entries.length]);

  function closeFirstRun() {
    localStorage.setItem(FIRST_RUN_KEY, "true");
    setFirstRunOpen(false);
  }

  const filtered = useMemo(() => searchMedia(items, query), [items, query]);

  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    const update = () => setToday(localDateKey(new Date()));
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const todayMemories = useMemo(() => memoryGroups(items, today, "today").flatMap(group => group.items), [items, today]);
  const selectedCount = selectedIds.size;
  const activeMonth = useMemo(() => resolveJournalMonth(selectedMonth, items), [selectedMonth, items]);
  const monthItems = useMemo(() => filterJournalMonth(filtered, activeMonth), [filtered, activeMonth]);
  const topbarTitle = activeView === "Library" && photoMode === "grid"
    ? journalMonthTitle(activeMonth)
    : viewLabels[activeView];
  const topbarCount = activeView === "Home" ? "오늘도 반가워요" : activeView === "Characters" ? "" : activeView === "Albums" ? `${savedAlbums.length}개의 앨범` : activeView === "Diary" ? `${diary.entries.length}편의 일기` : `${items.length}개의 기록`;

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
    setActiveView(view); setPhotoMode("grid"); setMemorySection("rediscover"); setQuery("");
    selection.reset(); setSelectionNotice("");
    if (view === "Home" || view === "Characters") void characters.refresh();
  }

  useAndroidBack(activeView === "Home", Boolean(importing), () => navigate("Home"));

  function startAlbum() {
    navigate("Library"); setSelectedMonth("all"); selection.reset(true);
    setSelectionNotice(items.length ? "앨범에 담을 사진과 영상을 선택해 주세요." : "먼저 사진과 영상을 가져온 뒤 앨범에 담을 기록을 선택해 주세요.");
    if (!items.length) setImportOpen(true);
  }

  async function deleteSelectedItems() {
    if (!selectedCount || !window.confirm(`선택한 ${selectedCount}개 항목을 등록 목록에서 지울까요? 원본 파일은 삭제되지 않습니다.`)) return;
    const ids = new Set(selectedIds);
    if (await library.removeMedia(ids)) {
      selection.clear();
      setSelectionNotice(`${ids.size}개 항목을 등록 목록에서 지웠습니다.`);
    }
  }

  async function createAlbumFromSelectedItems(title: string, coverColor: string, calendar?: CalendarRegistrationOptions) {
    const albumItems = albumDraftItems ?? [];
    if (!albumItems.length || !title.trim()) return;
    await library.createAlbum(title.trim(), coverColor, albumItems, calendar);
    navigate("Albums");
    setSelectionNotice(`'${title.trim()}' 앨범에 ${albumItems.length}개 항목을 담았습니다.`);
    selection.reset();
  }

  return (
    <main className={`app${largeLayout ? " largeLayout" : ""}`} style={{ "--app-header-height": `${navigationHeight}px` } as CSSProperties}>
      <header ref={navigationRef} className="sidebar" aria-label="주 메뉴">
        <button type="button" className="brand" aria-label="감자싹 홈으로 이동" title="홈으로 이동" onClick={() => navigate("Home")}>
          <BrandLogo />
        </button>

        <MainNavigation activeKey={`${activeView}:${largeLayout}`}>
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
        </MainNavigation>
        <button className="layoutToggle" aria-pressed={largeLayout} onClick={() => { setLargeLayout(!largeLayout); localStorage.setItem("warm-journal-large-layout", String(!largeLayout)); }}>{largeLayout ? "기본 크기" : "크게 보기"}</button>
        <button className="globalSettings" aria-label="설정" title="설정" aria-pressed={activeView === "Settings"} onClick={() => navigate("Settings")}><Settings size={20} /><span>설정</span></button>
      </header>

      <section className="workspace">
        <header className={`topbar view-${activeView.toLowerCase()}`}>
          <div className="collectionHeading">
            <h1 aria-label={viewLabels[activeView]}>{topbarTitle}</h1>
            <span className="collectionCount">{topbarCount}</span>
          </div>
          <div className="toolbar">
            {activeView !== "Home" && activeView !== "Characters" && !(activeView === "Library" && photoMode === "grid") && !(activeView === "Memories" && memorySection === "map") && <label className="searchBox">
              <Search size={18} />
              <input aria-label={activeView === "People" ? "이름 검색" : activeView === "Diary" ? "일기 검색" : activeView === "Albums" ? "앨범 검색" : "사진과 추억 검색"} value={query} onChange={(event) => { setQuery(event.target.value); if (activeView === "Library" && activeMonth !== "favorites") setSelectedMonth("all"); }} placeholder={activeView === "People" ? "이름 검색" : activeView === "Diary" ? "일기 검색" : activeView === "Albums" ? "앨범을 검색하세요" : "사진과 추억을 검색하세요"} />
              {query && <button className="searchClear" aria-label="검색 지우기" onClick={() => setQuery("")}><X size={15} /></button>}
            </label>}
            {(activeView === "Library" || activeView === "Albums") && <div className="importActions">
              <button className="primary" aria-label={importing ? "사진과 영상을 가져오는 중" : activeView === "Albums" ? "새 앨범 만들기" : "사진·영상 가져오기"} onClick={activeView === "Albums" ? startAlbum : () => setImportOpen(true)} disabled={Boolean(importing)}>
                {importing ? <LoaderCircle className="spinIcon" size={18} /> : <Plus size={18} />}
                <span className="primaryActionLabel">{importing ? "사진과 영상을 가져오는 중" : activeView === "Albums" ? "새 앨범 만들기" : "사진·영상 가져오기"}</span>
                <span className="primaryActionShort" aria-hidden="true">{importing ? "가져오는 중" : activeView === "Albums" ? "새 앨범" : "가져오기"}</span>
              </button>
              {importing && (
                <div className="importStatus" role="status" aria-live="polite">
                  <LoaderCircle className="spinIcon" size={18} />
                  <span>{importing === "folder" ? "폴더에서 사진과 영상을 가져오는 중" : "사진과 영상을 가져오는 중"}</span>
                </div>
              )}
            </div>}
            <input ref={fileInput} type="file" accept={MEDIA_FILE_ACCEPT} multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { void library.completeImport(event.target.files, "files").then(created => { if (created) navigate("Albums"); }); event.currentTarget.value = ""; }} hidden />
            <input
              ref={folderInput}
              type="file"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => { void library.completeImport(event.target.files, "folder").then(created => { if (created) navigate("Albums"); }); event.currentTarget.value = ""; }}
              hidden
              {...({ webkitdirectory: "" } as Record<string, string>)}
            />
          </div>
        </header>

        <section className="contentGrid">
          <div className="mainPanel">
            <div className="gomiHelpEntry"><button type="button" className="gomiHelpButton" aria-label="고미 도움말 열기" onClick={() => setGuideTopic(currentGuideTopic)}><img src="/characters/gomi/idle.png" alt="" draggable={false} />고미 도움말</button></div>
            {activeView === "Home" && <HomeView today={today} itemCount={items.length} albumCount={savedAlbums.length} diaryCount={diary.entries.length}
              mainCharacter={mainCharacter} onInteract={id => { void characters.interact(id); }} onShowCharacters={() => navigate("Characters")}
              onShowLibrary={() => navigate("Library")} onShowAlbums={() => navigate("Albums")} onShowDiary={() => navigate("Diary")} />}
            {activeView === "Characters" && <CharacterBook characters={characters.snapshot.characters} onRename={characters.rename} onSetMain={characters.setMain} />}
            {characters.error && (activeView === "Home" || activeView === "Characters") && <p role="alert">{characters.error}</p>}
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
                onSelectAll={selection.toggleMany}
                onToggleSelectionMode={toggleSelectionMode}
                selectedCount={selectedCount}
                commentCounts={commentCounts}
                onCreateAlbum={() => setAlbumDraftItems(items.filter((item) => selectedIds.has(item.id)))}
                onDeleteSelected={deleteSelectedItems}
                onAssignRegion={library.assignRegion}
                albums={savedAlbums}
                onShowAlbums={() => navigate("Albums")}
                onNewAlbum={startAlbum}
                onImport={() => setImportOpen(true)}
                onViewMedia={openViewer}
                scopeKey={`${activeMonth}:${query}`}
                query={query}
                onQueryChange={(value) => { setQuery(value); if (activeMonth !== "favorites") setSelectedMonth("all"); }}
              />
            )}
            {activeView === "Diary" && <DiaryView onQueryChange={setQuery} onPhotosImported={library.reloadRegisteredMedia} entries={diary.entries} albums={savedAlbums} query={query} error={diary.error} onSave={diary.save} onAssign={diary.assign} onDelete={diary.remove} />}
            {activeView === "Albums" && <SavedAlbumsView diaries={diary.entries} albums={savedAlbums} query={query} onNewAlbum={startAlbum} onOpen={openViewer} onSave={library.saveAlbum} onDelete={library.deleteAlbums} />}
            {activeView === "Memories" && <MemoriesWorkspace items={filtered} allItems={items} today={today} onOpen={openViewer} onShowLibrary={() => navigate("Library")}
              onSectionChange={(section) => { setMemorySection(section); if (section === "map") setQuery(""); }}
              onAssignRegion={library.assignRegion} onLocationsAnalyzed={library.refreshLocations}
              onCreateAlbum={(records, title = "") => { setAlbumDraftItems(records); setAlbumDraftTitle(title); }} />}
            {activeView === "People" && <PeopleWorkspace items={items} query={query} onOpen={openViewer} onCreateAlbum={setAlbumDraftItems} activeTab={peopleTab} onTabChange={setPeopleTab} />}
            {activeView === "Settings" && <SettingsPanel itemCount={items.length} clearing={clearing} onClear={clearAllRegisteredMedia} />}
          </div>
        </section>
        {firstRunOpen && <FirstRunGuide onLater={closeFirstRun} onGuide={() => { closeFirstRun(); setGuideTopic("photos"); }} onImport={() => { closeFirstRun(); setImportOpen(true); }} />}
        {guideTopic && <GomiGuide initialTopic={guideTopic} onClose={() => setGuideTopic(null)} onAction={topic => {
          setGuideTopic(null);
          if (topic === "photos") { navigate("Library"); setImportOpen(true); }
          else {
            if (topic === "people" || topic === "pets") setPeopleTab(topic);
            navigate(({ people: "People", pets: "People", albums: "Albums", diary: "Diary", memories: "Memories", characters: "Characters" } as const)[topic]);
          }
        }} />}
        {!firstRunOpen && !guideTopic && pendingCharacterEvent && <CharacterEventModal event={pendingCharacterEvent}
          onMeet={() => { void characters.dismiss(pendingCharacterEvent.id).then(saved => { if (saved) navigate("Characters"); }); }}
          onLater={() => { void characters.dismiss(pendingCharacterEvent.id); }} />}
        {importOpen && <MediaImportModal onClose={() => setImportOpen(false)} onImport={async options => {
          const created = await library.requestImport(options);
          if (created) navigate("Albums");
        }} />}
        {library.error && <p className="selectionNotice" role="alert">{library.error}</p>}
        {library.importNotice && !library.error && <p className="selectionNotice" role="status">{library.importNotice}</p>}
        {selectionNotice && <p className="selectionNotice" role="status">{selectionNotice}</p>}
        {albumDraftItems && <AlbumCreateModal items={albumDraftItems} initialTitle={albumDraftTitle} onClose={() => { setAlbumDraftItems(null); setAlbumDraftTitle(""); }} onCreate={createAlbumFromSelectedItems} />}
        {selected && (
          <DetailModal
            item={selected}
            onChange={updateSelected}
            onSaveTitle={library.saveTitle}
            onAssignRegion={library.assignRegion}
            onClose={viewer.close}
            onPrev={() => viewer.move(-1)}
            onNext={() => viewer.move(1)}
          />
        )}
        {library.importProgress && <MediaImportProgress progress={library.importProgress} />}
      </section>
    </main>
  );
}
