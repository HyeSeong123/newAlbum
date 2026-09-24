import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, CheckSquare, ChevronLeft, ChevronRight, Heart, Music, Play, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState, MediaVisual } from "../../components/MediaVisual";
import { useRowSelection } from "../../hooks/useRowSelection";
import { loadDayNotes } from "../calendar/calendarModel";
import { groupByTakenDate } from "./mediaService";
import { arrangeJournalItems, formatJournalDate, mediaSummary } from "./journalModel";
import { selectMediaCollection, type LibrarySort, type LibraryMediaType } from "./collectionModel";

const GALLERY_PAGE_SIZE = 48;

export function Library({
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
  const visibleCollection = useMemo(() => selectMediaCollection(items, {
    mediaType, favoritesOnly, commentsOnly, minimumRating, sort,
  }, commentCounts), [items, mediaType, favoritesOnly, commentsOnly, minimumRating, sort, commentCounts]);
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
