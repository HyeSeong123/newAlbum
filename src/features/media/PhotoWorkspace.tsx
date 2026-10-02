import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, LayoutGrid, Plus } from "lucide-react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import { Library } from "./LibraryView";
import { PhotoDateNavigation } from "./PhotoDateNavigation";
import { filterJournalMonth, mediaSummary } from "./journalModel";
import { Calendar } from "../calendar/Calendar";
import { AlbumFullscreenReader } from "../albums/AlbumReader";
import { AlbumCover } from "../albums/AlbumCover";
import { ExportModal } from "../../components/ExportModal";
export type PhotoMode = "grid" | "calendar" | "album";

export function PhotoView({
  mode, setMode, items, allItems, activeMonth, onMonthChange, selected, onOpen,
  selectionMode, selectedIds, onToggleSelection, onSelectAll, onToggleSelectionMode,
  selectedCount, commentCounts, onCreateAlbum, onDeleteSelected, albums,
  onShowAlbums, onNewAlbum, onImport, onViewMedia, onAssignRegion, scopeKey, query, onQueryChange,
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
  onSelectAll: (ids: string[]) => void;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  commentCounts: Record<string, number>;
  onCreateAlbum: () => void;
  onDeleteSelected: () => void;
  albums: SavedAlbum[];
  onShowAlbums: () => void;
  onNewAlbum: () => void;
  onImport: () => void;
  onViewMedia: (item: MediaItem, collection?: MediaItem[]) => void;
  onAssignRegion: (ids: string[], code: string, district?: string, country?: string, city?: string) => Promise<void>;
  scopeKey: string;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [quickAlbumId, setQuickAlbumId] = useState<string | null>(null);
  const [exportingQuickAlbum, setExportingQuickAlbum] = useState(false);
  const quickAlbum = albums.find((album) => album.id === quickAlbumId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingTabFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingTabFocus.current === null) return;
    tabRefs.current[pendingTabFocus.current]?.focus();
    pendingTabFocus.current = null;
  }, [mode]);
  const monthItems = useMemo(() => filterJournalMonth(items, activeMonth), [items, activeMonth]);
  const tabs = [
    { mode: "grid" as const, label: "사진 모아보기", Icon: LayoutGrid },
    { mode: "calendar" as const, label: "달력", Icon: CalendarDays },
    { mode: "album" as const, label: "책 보기", Icon: BookOpen },
  ];
  const viewTabs = <div className="viewTabs" role="tablist" aria-label="사진 보기 방식">
      {tabs.map((tab, index) => <button key={tab.mode} ref={(node) => { tabRefs.current[index] = node; }} id={`photo-tab-${tab.mode}`} role="tab" aria-selected={mode === tab.mode} aria-controls={`photo-panel-${tab.mode}`} tabIndex={mode === tab.mode ? 0 : -1} className={mode === tab.mode ? "active" : ""} onClick={() => setMode(tab.mode)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        if (tabs[next].mode === mode) {
          tabRefs.current[next]?.focus();
          return;
        }
        // The grid mounts its tabs inside Library; focus after the new DOM commits.
        pendingTabFocus.current = next;
        setMode(tabs[next].mode);
      }}><tab.Icon size={16} />{tab.label}</button>)}
    </div>;
  return <div className={`photoWorkspace mode-${mode}`}>
    {mode === "grid" && <PhotoDateNavigation items={allItems} activeMonth={activeMonth} onChange={onMonthChange} />}
    {mode !== "grid" && viewTabs}
    {mode === "grid" && <Library
      viewTabs={viewTabs}
      items={monthItems} selected={selected} onOpen={onOpen} selectionMode={selectionMode}
      selectedIds={selectedIds} onToggleSelection={onToggleSelection} onSelectAll={onSelectAll}
      onToggleSelectionMode={onToggleSelectionMode} selectedCount={selectedCount}
      commentCounts={commentCounts} onCreateAlbum={onCreateAlbum} onDeleteSelected={onDeleteSelected}
      onAssignRegion={onAssignRegion}
      onImport={allItems.length ? undefined : onImport}
      query={query} onQueryChange={onQueryChange}
      scopeKey={scopeKey} emptyText={allItems.length ? "조건에 맞는 기록이 없습니다. 다른 월을 선택하거나 검색을 바꿔보세요." : "아직 사진 기록이 없습니다."}
      onDateSearch={() => onMonthChange("all")}
    />}
    {mode === "grid" && <aside className="quickAlbums" aria-label="내 앨범 미리보기">
      <header><h2>내 앨범</h2><button title="새 앨범 만들기" onClick={onNewAlbum}><Plus size={17} />새 앨범</button></header>
      {albums.slice(0, 2).map((album) => <button className="quickAlbum" key={album.id} onClick={() => setQuickAlbumId(album.id)} aria-label={`${album.title} 앨범 열기`}>
        <AlbumCover title={album.title} items={album.items} color={album.coverColor} />
        <span className="quickAlbumMeta">{mediaSummary(album.items)}</span>
      </button>)}
      {!albums.length && <div className="quickAlbumEmpty"><p>함께 기억하고 싶은 순간을<br />한 권의 앨범에 담아보세요.</p><button onClick={onNewAlbum}><Plus size={15} />첫 앨범 만들기</button></div>}
      {albums.length > 0 && <button className="showAllAlbums" onClick={onShowAlbums}>모두 보기 <ChevronRight size={16} /></button>}
    </aside>}
    {mode === "calendar" && <div className="calendarTabPanel" id="photo-panel-calendar" role="tabpanel" aria-labelledby="photo-tab-calendar"><Calendar items={items} onOpen={(item) => onViewMedia(item, items)} /></div>}
    {mode === "album" && <div id="photo-panel-album" role="tabpanel" aria-labelledby="photo-tab-album"><AlbumFullscreenReader title="모든 기록" items={items} open={true} backLabel="사진 기록" onOpen={onViewMedia} onClose={() => setMode("grid")} /></div>}
    {quickAlbum && <AlbumFullscreenReader title={quickAlbum.title} items={quickAlbum.items} contents={quickAlbum.contents} color={quickAlbum.coverColor} open={true} backLabel="사진 기록" onOpen={onViewMedia} onClose={() => { setQuickAlbumId(null); setExportingQuickAlbum(false); }} onExport={() => setExportingQuickAlbum(true)} />}
    {quickAlbum && exportingQuickAlbum && <ExportModal title={quickAlbum.title} items={quickAlbum.items} onClose={() => setExportingQuickAlbum(false)} />}
  </div>;
}
