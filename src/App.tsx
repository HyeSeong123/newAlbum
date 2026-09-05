import { ChangeEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  BookOpen,
  Dices,
  FolderOpen,
  Heart,
  Image,
  Info,
  LayoutGrid,
  LoaderCircle,
  ListTree,
  Maximize2,
  Music,
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { mediaItems as seedItems } from "./features/media/mockMedia";
import { groupByTakenDate, isSupportedMedia } from "./features/media/mediaService";
import {
  chooseAndRegisterFiles,
  chooseAndRegisterFolder,
  clearRegisteredMedia,
  createAlbumFromMedia,
  deleteRegisteredMedia,
  isTauriRuntime,
  loadRegisteredMedia,
  saveMediaDetails,
} from "./services/tauriMediaService";
import type { MediaItem } from "./types/media";

type View = "Library" | "Timeline" | "Memories" | "People" | "Settings";
type PhotoMode = "grid" | "calendar" | "album";
type AlbumPage = MediaItem[];

const viewLabels: Record<View, string> = {
  Library: "사진보기",
  Timeline: "시간순",
  Memories: "지난 추억",
  People: "인물",
  Settings: "설정",
};

const navItems: Array<{ name: View; label: string; icon: typeof LayoutGrid }> = [
  { name: "Library", label: viewLabels.Library, icon: LayoutGrid },
  { name: "Timeline", label: viewLabels.Timeline, icon: ListTree },
  { name: "Memories", label: viewLabels.Memories, icon: Sparkles },
  { name: "People", label: viewLabels.People, icon: Users },
  { name: "Settings", label: viewLabels.Settings, icon: Settings },
];

export function App() {
  const [activeView, setActiveView] = useState<View>("Library");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("grid");
  const [items, setItems] = useState(seedItems);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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
  const mediaStats = useMemo(() => {
    return {
      total: items.length,
      images: items.filter((item) => item.fileType === "image").length,
      videos: items.filter((item) => item.fileType === "video").length,
      favorites: items.filter((item) => item.favorite).length,
    };
  }, [items]);

  useEffect(() => {
    if (!tauriEnabled) return;
    loadRegisteredMedia()
      .then((registered) => {
        setItems(registered);
      })
      .catch((error) => console.error("등록된 미디어를 불러오지 못했습니다.", error));
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
        takenAt: null,
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
      <aside className="sidebar" aria-label="주 메뉴">
        <div className="brand">
          <div className="brandMark"><Image size={22} /></div>
          <div>
            <strong>오래담은</strong>
            <span>나만의 추억 앨범</span>
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
          <span>사진과 영상, 음원을 한곳에 모아두었습니다.</span>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">나의 기록</p>
            <h1>{viewLabels[activeView]}</h1>
          </div>
          <div className="toolbar">
            <label className="searchBox">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일, 코멘트, 태그 검색" />
            </label>
          </div>
        </header>

        <section className="overviewGrid">
          <section className="memoryIntro" aria-busy={Boolean(importing)}>
            <div>
              <p>오늘 남겨둘 순간</p>
              <h2>사진과 영상을 골라 담고, 날짜와 이야기로 천천히 다시 꺼내보세요.</h2>
            </div>
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
          </section>
          <aside className="summaryStack" aria-label="앨범 현황">
            <StatCard icon={Image} label="전체 기록" value={`${mediaStats.total}개`} />
            <StatCard icon={LayoutGrid} label="사진" value={`${mediaStats.images}장`} />
            <StatCard icon={Play} label="영상" value={`${mediaStats.videos}개`} />
            <StatCard icon={Heart} label="즐겨찾기" value={`${mediaStats.favorites}개`} />
          </aside>
        </section>

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
              />
            )}
            {activeView === "Timeline" && <Timeline groups={groups} onOpen={openMedia} />}
            {activeView === "Memories" && <Memories items={todayMemories} onOpen={openMedia} />}
            {activeView === "People" && <FuturePanel title="인물" text="함께한 사람별로 사진을 모아볼 수 있도록 준비 중입니다." />}
            {activeView === "Settings" && <SettingsPanel itemCount={items.length} clearing={clearing} onClear={clearAllRegisteredMedia} />}
          </div>
        </section>
        {selectionMode && (
          <div className="selectionBar" role="status" aria-live="polite">
            <span>{selectedCount ? `${selectedCount}개 선택됨` : "사진을 클릭하거나 드래그해서 선택하세요."}</span>
            <div>
              <button className="iconText" onClick={createAlbumFromSelectedItems} disabled={!selectedCount}>
                <Plus size={17} />앨범 만들기
              </button>
              <button className="dangerButton" onClick={deleteSelectedItems} disabled={!selectedCount}>
                <Trash2 size={17} />삭제
              </button>
            </div>
          </div>
        )}
        {selectionNotice && <p className="selectionNotice">{selectionNotice}</p>}
        {selected && (
          <DetailModal
            item={selected}
            onChange={updateSelected}
            onClose={() => setSelected(null)}
            onPrev={() => moveSelection(-1)}
            onNext={() => moveSelection(1)}
          />
        )}
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Image; label: string; value: string }) {
  return (
    <div className="statCard">
      <span><Icon size={18} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
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
}) {
  return (
    <>
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
      {mode === "grid" && (
        <Library
          items={items}
          selected={selected}
          onOpen={onOpen}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelection={onToggleSelection}
          onToggleSelectionMode={onToggleSelectionMode}
        />
      )}
      {mode === "calendar" && <Calendar items={items} onOpen={onOpen} />}
      {mode === "album" && <Albums items={items} onOpen={onOpen} />}
    </>
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
}: {
  items: MediaItem[];
  selected: MediaItem | null;
  onOpen: (item: MediaItem) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
}) {
  const dragStarted = useRef(false);
  const dragSeen = useRef<Set<string>>(new Set());

  function selectFromPoint(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-media-id]");
    const id = target?.dataset.mediaId;
    if (!id || dragSeen.current.has(id)) return;
    dragSeen.current.add(id);
    onToggleSelection(id);
  }

  function startDragSelect(event: PointerEvent<HTMLDivElement>) {
    if (!selectionMode) return;
    dragStarted.current = true;
    dragSeen.current = new Set();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectFromPoint(event.clientX, event.clientY);
  }

  function moveDragSelect(event: PointerEvent<HTMLDivElement>) {
    if (!selectionMode || !dragStarted.current) return;
    selectFromPoint(event.clientX, event.clientY);
  }

  function endDragSelect(event: PointerEvent<HTMLDivElement>) {
    if (!selectionMode) return;
    dragStarted.current = false;
    dragSeen.current = new Set();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <div className="panelHeader">
        <div>
          <h2>모아보기</h2>
          <p>사진, 영상, 음원을 편하게 찾아보고 골라볼 수 있습니다.</p>
        </div>
        <div className="panelActions">
          <button className={selectionMode ? "iconText activeAction" : "iconText"} onClick={onToggleSelectionMode}>
            {selectionMode ? <X size={17} /> : <CheckSquare size={17} />}
            {selectionMode ? "선택 해제" : "선택"}
          </button>
          <button className="iconText"><SlidersHorizontal size={17} />필터</button>
        </div>
      </div>
      {!items.length && <EmptyState text="아직 담긴 사진과 영상이 없습니다. 위의 파일 선택 또는 폴더 선택으로 첫 기록을 담아보세요." />}
      <div
        className={selectionMode ? "galleryGrid selecting" : "galleryGrid"}
        onPointerDown={startDragSelect}
        onPointerMove={moveDragSelect}
        onPointerUp={endDragSelect}
        onPointerCancel={endDragSelect}
      >
        {items.map((item) => (
          <button
            key={item.id}
            data-media-id={item.id}
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
              {selectionMode && <span className="selectMark">{selectedIds.has(item.id) ? "선택됨" : "선택"}</span>}
            </MediaVisual>
            <span>{item.fileName}</span>
            <small>{item.takenAt ?? "날짜 없음"} · {item.sizeLabel}</small>
          </button>
        ))}
      </div>
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
                <span>{item.fileName}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Calendar({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const availableMonths = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => (item.takenAt ? [item.takenAt.slice(0, 7)] : [])))).sort().reverse();
  }, [items]);
  const availableYears = useMemo(() => {
    return Array.from(new Set(availableMonths.map((monthLabel) => monthLabel.slice(0, 4)))).sort().reverse();
  }, [availableMonths]);
  const [visibleMonth, setVisibleMonth] = useState(availableMonths[0] ?? new Date().toISOString().slice(0, 7));
  const [selectedYear, selectedMonth] = visibleMonth.split("-");
  const year = Number(selectedYear);
  const month = Number(selectedMonth);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ kind: "blank" as const, id: `blank-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ kind: "day" as const, day: index + 1, id: `day-${index + 1}` })),
  ];

  function moveMonth(offset: number) {
    const next = new Date(year, month - 1 + offset, 1);
    setVisibleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function updateMonth(part: "year" | "month", value: string) {
    const nextYear = part === "year" ? value : selectedYear;
    const nextMonth = part === "month" ? value : selectedMonth;
    setVisibleMonth(`${nextYear}-${nextMonth}`);
  }

  if (!items.length) {
    return (
      <div className="calendarPanel">
        <EmptyState text="달력에 표시할 사진과 영상이 아직 없습니다." />
      </div>
    );
  }

  return (
    <div className="calendarPanel">
      <div className="panelHeader">
        <div>
          <h2>{year}년 {month}월</h2>
          <p>날짜별로 남겨둔 순간을 한눈에 확인합니다.</p>
        </div>
        <div className="monthPicker" aria-label="연월 선택">
          <label>
            <span>연도</span>
            <select value={selectedYear} onChange={(event) => updateMonth("year", event.target.value)}>
              {availableYears.map((yearLabel) => (
                <option key={yearLabel} value={yearLabel}>{yearLabel}년</option>
              ))}
            </select>
          </label>
          <label>
            <span>월</span>
            <select value={selectedMonth} onChange={(event) => updateMonth("month", event.target.value)}>
              {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((monthLabel) => (
                <option key={monthLabel} value={monthLabel}>{Number(monthLabel)}월</option>
              ))}
            </select>
          </label>
        </div>
        <div className="monthControls" aria-label="달 이동">
          <button onClick={() => moveMonth(-1)} title="이전 달"><ChevronLeft size={17} />이전 달</button>
          <button onClick={() => moveMonth(1)} title="다음 달">다음 달<ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="calendarGrid">
        {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
          <span className="weekday" key={label}>{label}</span>
        ))}
        {calendarCells.map((cell) => {
          if (cell.kind === "blank") return <span className="emptyDay" key={cell.id} />;
          const date = `${visibleMonth}-${String(cell.day).padStart(2, "0")}`;
          const matches = items.filter((item) => item.takenAt === date);
          return (
            <button key={cell.id} className={matches.length ? "hasMedia" : ""} onClick={() => matches[0] && onOpen(matches[0])}>
              <span>{cell.day}</span>
              {matches[0] && (
                <i style={{ background: matches[0].thumbnail }}>
                  <MediaImage item={matches[0]} />
                </i>
              )}
              {matches.length > 0 && <b>{matches.length}</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Albums({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const [pages, setPages] = useState<AlbumPage[]>(() => makeAlbumPages(items));
  const [pageIndex, setPageIndex] = useState(0);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [visibleLeftItems, setVisibleLeftItems] = useState<AlbumPage>(() => splitAlbumPage(pages[0] ?? []).left);
  const [visibleRightItems, setVisibleRightItems] = useState<AlbumPage>(() => splitAlbumPage(pages[0] ?? []).right);
  const visibleItemCount = visibleLeftItems.length + visibleRightItems.length;

  useEffect(() => {
    const nextPages = makeAlbumPages(items);
    const firstSpread = splitAlbumPage(nextPages[0] ?? []);
    setPages(nextPages);
    setPageIndex(0);
    setTurning(null);
    setVisibleLeftItems(firstSpread.left);
    setVisibleRightItems(firstSpread.right);
  }, [items]);

  useEffect(() => {
    if (!readerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setReaderOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [readerOpen]);

  function shuffleAlbum() {
    const nextPages = makeAlbumPages(items);
    const firstSpread = splitAlbumPage(nextPages[0] ?? []);
    setPages(nextPages);
    setPageIndex(0);
    setTurning(null);
    setVisibleLeftItems(firstSpread.left);
    setVisibleRightItems(firstSpread.right);
  }

  function turnPage(direction: -1 | 1) {
    if (turning) return;
    const nextIndex = Math.min(Math.max(pageIndex + direction, 0), pages.length - 1);
    if (nextIndex === pageIndex) return;

    const nextSpread = splitAlbumPage(pages[nextIndex] ?? []);
    setTurning(direction > 0 ? "next" : "prev");
    if (direction > 0) {
      setVisibleRightItems(nextSpread.right);
      window.setTimeout(() => setVisibleLeftItems(nextSpread.left), 360);
    } else {
      setVisibleLeftItems(nextSpread.left);
      window.setTimeout(() => setVisibleRightItems(nextSpread.right), 360);
    }
    window.setTimeout(() => setPageIndex(nextIndex), 760);
    window.setTimeout(() => setTurning(null), 820);
  }

  return (
    <div className="albumReader">
      <div className="panelHeader">
        <div>
          <h2>나의 앨범</h2>
          <p>화면을 크게 열고, 사진을 위아래로 가지런히 놓은 책장을 넘겨봅니다.</p>
        </div>
        <button className="iconText" onClick={shuffleAlbum}><Dices size={17} />다시 섞기</button>
      </div>
      {!items.length && <EmptyState text="앨범에 꽂아둘 사진과 영상이 아직 없습니다." />}
      <section className="albumLauncher" aria-label="앨범 전체창 열기">
        <BookOpen size={42} />
        <div>
          <h3>앨범을 펼쳐보기</h3>
          <p>한쪽 페이지에 사진 두 장씩, 정방향으로 차분하게 보여줍니다.</p>
        </div>
        <button className="primary" onClick={() => setReaderOpen(true)} disabled={!items.length}>
          <Maximize2 size={17} />전체창으로 보기
        </button>
      </section>
      {readerOpen && (
        <div className="albumFullscreen" role="dialog" aria-modal="true" aria-label="앨범 전체창">
          <header className="albumFullscreenHeader">
            <div>
              <p className="eyebrow">오래담은 앨범</p>
              <h2>나의 앨범</h2>
            </div>
            <div className="panelActions">
              <button className="iconText" onClick={shuffleAlbum}><Dices size={17} />다시 섞기</button>
              <button className="closeButton" onClick={() => setReaderOpen(false)} title="닫기"><X size={18} /></button>
            </div>
          </header>
          <div className={`bookSpread immersive layout-${visibleItemCount || 1} ${turning ? `turning-${turning}` : ""}`} aria-label="앨범 책장">
            <button className="pageTurn left" onClick={() => turnPage(-1)} disabled={Boolean(turning) || pageIndex === 0} title="이전 책장">
              <ChevronLeft size={24} />
            </button>
            <div className="bookPage leftPage">
              <span className="pageNumber">{pageIndex + 1}</span>
              {visibleLeftItems.map((item) => (
                <button key={item.id} className="albumPhoto" onClick={() => onOpen(item)} aria-label={`${item.fileName} 상세보기`}>
                  <MediaVisual item={item}>
                    {item.fileType === "video" && <Play size={28} fill="currentColor" />}
                    {item.fileType === "audio" && <Music size={28} />}
                  </MediaVisual>
                  <span>{item.comment || item.fileName}</span>
                </button>
              ))}
            </div>
            <div className="bookPage rightPage">
              <span className="pageNumber">{pageIndex + 2}</span>
              {visibleRightItems.map((item) => (
                <button key={item.id} className="albumPhoto" onClick={() => onOpen(item)} aria-label={`${item.fileName} 상세보기`}>
                  <MediaVisual item={item}>
                    {item.fileType === "video" && <Play size={28} fill="currentColor" />}
                    {item.fileType === "audio" && <Music size={28} />}
                  </MediaVisual>
                  <span>{item.comment || item.fileName}</span>
                </button>
              ))}
            </div>
            {turning && <span className={`paperTurnLayer ${turning}`} aria-hidden="true" />}
            <button className="pageTurn right" onClick={() => turnPage(1)} disabled={Boolean(turning) || pageIndex >= pages.length - 1} title="다음 책장">
              <ChevronRight size={24} />
            </button>
          </div>
          <p className="albumPager">{pageIndex + 1} / {pages.length} 책장</p>
        </div>
      )}
    </div>
  );
}

function makeAlbumPages(items: MediaItem[]): AlbumPage[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const pages: AlbumPage[] = [];
  let index = 0;
  while (index < shuffled.length) {
    const remaining = shuffled.length - index;
    const count = Math.min(remaining, 4);
    pages.push(shuffled.slice(index, index + count));
    index += count;
  }
  return pages.length ? pages : [[]];
}

function splitAlbumPage(page: AlbumPage): { left: AlbumPage; right: AlbumPage } {
  const midpoint = Math.ceil(page.length / 2);
  return {
    left: page.slice(0, midpoint),
    right: page.slice(midpoint),
  };
}

function Memories({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  return (
    <div className="memories">
      <h2>몇 년 전 오늘</h2>
      <p>오늘과 같은 날짜에 남겨둔 예전 기록을 모았습니다.</p>
      {!items.length && <EmptyState text="오늘과 같은 날짜의 예전 기록이 아직 없습니다." />}
      <div className="memoryGrid">
        {items.map((item) => (
          <button key={item.id} onClick={() => onOpen(item)}>
            <MediaVisual item={item} />
            <strong>{item.takenAt?.slice(0, 4)}</strong>
            <span>{item.comment || item.fileName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FuturePanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="futurePanel">
      <Info size={32} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="emptyState">
      <Image size={28} />
      <p>{text}</p>
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
  onChange,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaItem;
  onChange: (patch: Partial<MediaItem>) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section className="detailModal" role="dialog" aria-modal="true" aria-labelledby="detailTitle" onClick={(event) => event.stopPropagation()}>
        <div className="detailHeader">
          <button title="이전" onClick={onPrev}><ChevronLeft size={18} /></button>
          <strong>상세보기</strong>
          <button title="다음" onClick={onNext}><ChevronRight size={18} /></button>
          <button className="closeButton" title="닫기" onClick={onClose}><X size={18} /></button>
        </div>
        <MediaVisual item={item} className="detailStage">
          {item.fileType === "video" && <Play size={52} fill="currentColor" />}
          {item.fileType === "audio" && <Music size={52} />}
        </MediaVisual>
        <div className="detailBody">
          <div className="viewerMeta">
            <h3 id="detailTitle">{item.fileName}</h3>
            <span><Clock3 size={14} />{item.takenAt ?? "날짜 없음"}</span>
            <span>{item.width && item.height ? `${item.width} x ${item.height}` : item.duration} · {item.sizeLabel}</span>
          </div>
          <div className="rating" aria-label="별점">
            {[1, 2, 3, 4, 5].map((score) => (
              <button key={score} onClick={() => onChange({ rating: score })} title={`${score}점`}>
                <Star size={20} fill={score <= item.rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <textarea value={item.comment} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ comment: event.target.value })} placeholder="코멘트 입력" />
          <button className={item.favorite ? "favorite active" : "favorite"} onClick={() => onChange({ favorite: !item.favorite })}>
            <Heart size={17} fill={item.favorite ? "currentColor" : "none"} />
            즐겨찾기
          </button>
        </div>
      </section>
    </div>
  );
}

function MediaVisual({ item, className, children }: { item: MediaItem; className?: string; children?: ReactNode }) {
  return (
    <div className={className} style={{ background: item.thumbnail }}>
      <MediaImage item={item} />
      {children}
    </div>
  );
}

function MediaImage({ item }: { item: MediaItem }) {
  const src = getImageSrc(item);
  if (!src) return null;
  return <img className="mediaImage" src={src} alt="" loading="lazy" draggable={false} />;
}

function getImageSrc(item: MediaItem): string | null {
  if (item.fileType !== "image") return null;
  if (!isTauriRuntime()) return null;
  return convertFileSrc(normalizeLocalFilePath(item.filePath));
}

function normalizeLocalFilePath(filePath: string): string {
  if (filePath.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${filePath.slice("\\\\?\\UNC\\".length)}`;
  }

  if (filePath.startsWith("\\\\?\\")) {
    return filePath.slice("\\\\?\\".length);
  }

  return filePath;
}
