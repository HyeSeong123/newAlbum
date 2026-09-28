import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "../../types/media";
import { EmptyState } from "../../components/MediaVisual";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { useMediaSelection } from "../media/useMediaSelection";
import { isTauriRuntime, loadRegionPage, type RegionFilters, type RegionPage } from "../../services/tauriMediaService";
import { RegionEditor } from "./RegionEditor";
import { REGION_NAMES } from "./regions";
import { browserRegionPage, groupByMonth, orderRegionMedia, REGION_ALBUM_LIMIT } from "./memoryMapModel";

export function RegionGallery({ code, items, revision, focusVersion, summary, onOpen, onClose, onAssignRegion, onCreateAlbum }: {
  code: string; items: MediaItem[]; revision: number; focusVersion: number; summary: string;
  onOpen: (item: MediaItem, collection: MediaItem[]) => void; onClose: () => void;
  onAssignRegion: (ids: string[], code: string, district?: string, country?: string, city?: string) => Promise<void>;
  onCreateAlbum: (items: MediaItem[], title?: string) => void;
}) {
  const [filters, setFilters] = useState<RegionFilters>({ fileType: "all", year: "", oldest: false, district: "" });
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<RegionPage>({ items: [], total: 0, years: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [focusVersion, page]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const selection = useMediaSelection(byId);
  const desktop = isTauriRuntime();
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError("");
    const request = desktop ? loadRegionPage(code, page * 48, filters) : Promise.resolve(browserRegionPage(items, code, page * 48, filters));
    void request.then(value => {
      if (disposed) return;
      const last = Math.max(0, Math.ceil(value.total / 48) - 1);
      if (page > last) { setPage(last); return; }
      setResult(value);
    }).catch(() => { if (!disposed) { setError("지역 사진을 불러오지 못했습니다."); } })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [code, desktop, filters, items, page, revision, refresh]);
  function filter(patch: Partial<RegionFilters>) {
    setFilters(current => ({ ...current, ...patch })); setPage(0); selection.reset(); setNotice("");
  }
  function createAlbum() {
    const selected = selection.enabled ? orderRegionMedia(items.filter(item => selection.ids.has(item.id)), filters.oldest) : result.items;
    if (!selection.enabled && result.total > REGION_ALBUM_LIMIT) {
      selection.reset(true); setNotice("기록이 많아요. 앨범에 담을 사진과 영상을 선택해 주세요. 페이지를 넘겨서도 선택할 수 있어요."); return;
    }
    if (selected.length) onCreateAlbum(selected);
  }
  const pages = Math.max(1, Math.ceil(result.total / 48));
  const groups = useMemo(() => groupByMonth(result.items), [result.items]);
  const pageIds = result.items.map(item => item.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selection.ids.has(id));
  const districts = useMemo(() => [...new Set(items.filter(item => item.regionCode === code).map(item => item.district || "__unset__"))].sort((a,b) => a.localeCompare(b,"ko")), [items,code]);
  const filtered = filters.fileType !== "all" || filters.year !== "" || filters.oldest || Boolean(filters.district);
  return <section className="memoryMapGallery" aria-label={`${code === "unclassified" ? "지역 미분류" : code === "overseas" ? "해외 지역" : REGION_NAMES[code]} 기록`}>
    <header><div><span className="memoryMapEyebrow">장소가 간직한 순간</span><h3 ref={heading} tabIndex={-1}>{code === "unclassified" ? "지역 미분류" : code === "overseas" ? "해외 지역" : REGION_NAMES[code]}</h3><p>{summary}</p></div>
      <button className="memoryMapAll" onClick={onClose}>전체 지도 보기</button></header>
    <div className="regionGalleryToolbar"><div className="regionGalleryTools regionGalleryFilters">
      <label>종류<select aria-label="기록 종류" value={filters.fileType} onChange={event => filter({ fileType: event.target.value as RegionFilters["fileType"] })}>
        <option value="all">전체</option><option value="image">사진</option><option value="video">영상</option></select></label>
      <label>연도<select aria-label="기록 연도" value={filters.year} onChange={event => filter({ year: event.target.value })}>
        <option value="">전체 연도</option>{result.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      {code !== "unclassified" && code !== "overseas" && <label>시·군·구<select aria-label="시군구 필터" value={filters.district} onChange={event => filter({ district: event.target.value })}>
        <option value="">전체 시·군·구</option>{districts.map(name => <option key={name} value={name}>{name === "__unset__" ? "지역 미지정" : name}</option>)}</select></label>}
      <label>정렬<select aria-label="기록 정렬" value={filters.oldest ? "oldest" : "newest"} onChange={event => filter({ oldest: event.target.value === "oldest" })}>
        <option value="newest">최신순</option><option value="oldest">오래된순</option></select></label>
      {filtered && <button onClick={() => filter({ fileType: "all", year: "", oldest: false, district: "" })}>필터 초기화</button>}
    </div><div className="regionGalleryTools regionGalleryActions">
      <button aria-pressed={selection.enabled} onClick={() => { selection.reset(!selection.enabled); setNotice(""); }}>{selection.enabled ? "선택 끝내기" : "사진 선택"}</button>
      <button className="primaryControl" disabled={loading || Boolean(error) || (selection.enabled ? !selection.ids.size : !result.total)} onClick={createAlbum}>앨범 만들기</button>
    </div></div>
    {selection.enabled && <><div className="regionGalleryTools regionGallerySelection">
      <p role="status">{selection.ids.size}개 선택 · 페이지를 넘겨도 유지돼요. 필터를 바꾸면 초기화됩니다.</p>
      <button disabled={loading || Boolean(error) || !pageIds.length} onClick={() => selection.toggleMany(pageIds)}>{allPageSelected ? "이 페이지 선택 해제" : "이 페이지 전체 선택"}</button>
      <button disabled={!selection.ids.size} onClick={selection.clear}>선택 모두 해제</button>
    </div>
      <RegionEditor key={`${code}-${filters.fileType}-${filters.year}`} count={selection.ids.size} onSave={async (region, district, country, city) => {
        await onAssignRegion([...selection.ids], region, district, country, city); selection.clear(); setNotice("선택한 기록의 지역을 저장했습니다.");
      }} /></>}
    {notice && <p role="status">{notice}</p>}{error && <div className="memoryMapAlert" role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>사진 다시 불러오기</button></div>}
    {!loading && !error && <p aria-live="polite">필터 결과 {result.total}개{result.total > 0 && ` · ${page * 48 + 1}–${page * 48 + result.items.length}번째 기록`}</p>}
    {loading ? <p role="status">사진을 불러오는 중이에요.</p> : !error && (result.items.length ? groups.map(group => <div className="memoryMapMonth" key={group.month}>
      <h4>{/^\d{4}-\d{2}$/.test(group.month) ? `${group.month.slice(0,4)}년 ${Number(group.month.slice(5))}월` : group.month}</h4>
      <RecordMediaGrid items={group.items} onOpen={item => onOpen(item, result.items)} selectedIds={selection.ids} onToggle={selection.enabled ? selection.toggle : undefined} showLocationStatus={code === "unclassified"} />
    </div>) : !error && <EmptyState text="조건에 맞는 사진과 영상이 아직 없어요." />)}
    {!error && pages > 1 && <nav className="memoryMapPager" aria-label="지역 사진 페이지"><button disabled={loading || page === 0} onClick={() => setPage(page - 1)}>이전</button>
      <span>{page + 1} / {pages}</span><button disabled={loading || page >= pages - 1} onClick={() => setPage(page + 1)}>다음</button></nav>}
  </section>;
}
