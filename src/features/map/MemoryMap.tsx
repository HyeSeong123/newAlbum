import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, Image, MapPin, RefreshCw, Video } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState } from "../../components/MediaVisual";
import { RecordMediaGrid } from "../media/RecordMediaGrid";
import { analyzeLocationBatch, isTauriRuntime, loadLocationOverview, loadRegionMedia, queueFailedLocations, type LocationOverview } from "../../services/tauriMediaService";
import { MAP_REGIONS, REGION_LABELS, REGION_NAMES, groupByMonth, totalFor } from "./regionModel";
import "./memory-map.css";

const PAGE_SIZE = 48;

export function MemoryMap({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem, collection: MediaItem[]) => void }) {
  const [overview, setOverview] = useState<LocationOverview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageItems, setPageItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const alive = useRef(true);
  const desktop = isTauriRuntime();
  const fallback = useMemo<LocationOverview>(() => {
    const mappable = items.filter(item => item.fileType === "image" || item.fileType === "video");
    const regions = MAP_REGIONS.map(region => ({
      code: region.code, name: region.name,
      photos: mappable.filter(item => item.regionCode === region.code && item.fileType === "image").length,
      videos: mappable.filter(item => item.regionCode === region.code && item.fileType === "video").length,
    }));
    return { total: mappable.length, analyzed: mappable.length, pending: 0, failed: 0,
      unclassified: mappable.filter(item => !item.regionCode).length, regions };
  }, [items]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!desktop) { setOverview(fallback); return; }
    let disposed = false;
    void loadLocationOverview().then(value => { if (!disposed) { setOverview(value); setError(""); } })
      .catch(() => { if (!disposed) setError("위치 정보를 불러오지 못했습니다."); });
    return () => { disposed = true; };
  }, [desktop, fallback.total]);

  useEffect(() => {
    if (!selected) return;
    if (!desktop) { setPageItems(items.filter(item => item.fileType !== "audio" && (selected === "unclassified" ? !item.regionCode : item.regionCode === selected)).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)); return; }
    let disposed = false;
    setLoading(true);
    void loadRegionMedia(selected, page * PAGE_SIZE).then(records => { if (!disposed) { setPageItems(records); setError(""); } })
      .catch(() => { if (!disposed) setError("지역 사진을 불러오지 못했습니다."); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [desktop, items, overview?.analyzed, page, selected]);

  async function analyze(retry: boolean) {
    if (!desktop || running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      let progress = retry ? await queueFailedLocations() : overview ?? await loadLocationOverview();
      if (alive.current) setOverview(progress);
      while (progress.pending && alive.current) {
        const previous = progress.pending;
        progress = await analyzeLocationBatch();
        if (alive.current) setOverview(progress);
        if (progress.pending >= previous) throw new Error("진행 상태가 갱신되지 않았습니다.");
      }
    } catch { if (alive.current) setError("일부 파일의 위치를 분석하지 못했습니다. 다시 시도해 주세요."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }

  function select(code: string | null) { setSelected(code); setHovered(null); setPage(0); setPageItems([]); }

  const shown = overview ?? fallback;
  const covered = shown.regions.filter(region => region.photos + region.videos > 0).length;
  const located = shown.regions.reduce((sum, region) => sum + region.photos + region.videos, 0);
  const count = selected === "unclassified" ? shown.unclassified : selected ? totalFor(shown, selected) : 0;
  const activeRegion = hovered ?? selected;
  const summary = MAP_REGIONS.find(region => region.code === activeRegion);
  const summaryCount = shown.regions.find(region => region.code === activeRegion);
  const groups = groupByMonth(pageItems);
  const pages = Math.ceil(count / PAGE_SIZE);

  return <div className="memoryMap">
    <section className="memoryMapIntro" aria-label="추억 지도 요약">
      <div className="memoryMapIntroText"><span className="memoryMapEyebrow"><Compass size={16} />나의 추억 지도</span>
        <h2>사진이 남긴 곳, 다시 펼쳐보기</h2>
        <p>17개 지역 중 {covered}개 지역에 기록이 있어요. 지도에서 지역을 골라 그날의 사진을 만나보세요.</p></div>
      <div className="memoryMapStats"><div><strong>{located.toLocaleString()}</strong><span>위치가 있는 기록</span></div><div><strong>{shown.unclassified.toLocaleString()}</strong><span>지역 미분류</span></div></div>
    </section>
    {error && <p className="memoryMapAlert" role="alert">{error}</p>}
    <section className="memoryMapLayout" aria-label="대한민국 추억 분포">
      <div className="memoryMapPaper">
        <div className="memoryMapPaperHead"><div><span className="memoryMapEyebrow">우리의 장소들</span><h3>대한민국</h3></div><span>시·도별 기록</span></div>
        <svg className="memoryMapShape" viewBox="0 0 500 535" role="group" aria-label="대한민국 시·도 선택 지도">
          {MAP_REGIONS.map(region => {
            const amount = totalFor(shown, region.code);
            return <path key={region.code} d={region.path} fillRule="evenodd"
              className={`memoryMapRegion ${amount ? "has-records" : ""} ${selected === region.code ? "selected" : ""} ${hovered === region.code ? "hovered" : ""}`}
              role="button" tabIndex={0} aria-label={`${region.name} 총 ${amount}개`}
              aria-pressed={selected === region.code}
              onClick={() => select(region.code)} onMouseEnter={() => setHovered(region.code)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(region.code)} onBlur={() => setHovered(null)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(region.code); } }}>
              <title>{region.name} · {amount}개의 기록</title>
            </path>;
          })}
        </svg>
        <div className="memoryMapHover" aria-live="polite">{summary ? <>
          <strong>{summary.name}</strong><span><Image size={14} /> 사진 {summaryCount?.photos ?? 0}장</span><span><Video size={14} /> 영상 {summaryCount?.videos ?? 0}개</span>
        </> : <span><MapPin size={16} /> 지역을 선택해 사진을 찾아보세요.</span>}</div>
        <p className="memoryMapCredit">지도 경계: <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> (CC BY 4.0) · Natural Earth (공개 도메인)</p>
      </div>
      <aside className="memoryMapPlaces" aria-label="시도별 사진 개수">
        <div className="memoryMapPlacesHead"><h3>지역별 기록</h3><span>{covered} / 17개 지역</span></div>
        <div className="memoryMapPlaceList">{MAP_REGIONS.map(region => {
          const total = totalFor(shown, region.code);
          return <button key={region.code} aria-pressed={selected === region.code} className={total ? "has-records" : ""} onClick={() => select(region.code)}>
            <span>{REGION_LABELS[region.code]}</span><strong>{total.toLocaleString()}</strong>
          </button>;
        })}</div>
        <button className="memoryMapUnclassified" aria-pressed={selected === "unclassified"} onClick={() => select("unclassified")}>
          <MapPin size={16} /><span>지역 미분류</span><strong>{shown.unclassified.toLocaleString()}</strong>
        </button>
        {desktop && (shown.pending > 0 || shown.failed > 0 || busy) && <div className="memoryMapAnalysis">
          <div className="memoryMapAnalysisHeader"><strong>위치 정보 분석</strong><span aria-live="polite">{shown.analyzed.toLocaleString()} / {shown.total.toLocaleString()}</span></div>
          <progress aria-label="위치 정보 분석 진행" value={shown.analyzed} max={Math.max(1, shown.total)} />
          {shown.pending > 0 && <button disabled={busy} onClick={() => void analyze(false)}><RefreshCw size={15} className={busy ? "spinIcon" : ""} />{busy ? "분석 중" : "위치 정보 분석"}</button>}
          {shown.pending === 0 && shown.failed > 0 && <button disabled={busy} onClick={() => void analyze(true)}><RefreshCw size={15} />분석 실패 {shown.failed}개 다시 시도</button>}
        </div>}
      </aside>
    </section>
    {selected && <section className="memoryMapGallery" aria-label={`${selected === "unclassified" ? "지역 미분류" : REGION_NAMES[selected]} 기록`}>
      <header><div><span className="memoryMapEyebrow">장소가 간직한 순간</span><h3>{selected === "unclassified" ? "지역 미분류" : REGION_NAMES[selected]}</h3>
        <p>{selected === "unclassified" ? "GPS가 없거나 위치를 확인할 수 없는 기록이에요." : `${shown.regions.find(region => region.code === selected)?.photos ?? 0}장의 사진 · ${shown.regions.find(region => region.code === selected)?.videos ?? 0}개의 영상`}</p></div>
        <button className="memoryMapAll" onClick={() => select(null)}>전체 지도 보기</button></header>
      {loading ? <p role="status">사진을 불러오는 중이에요.</p> : pageItems.length ? groups.map(group => <div className="memoryMapMonth" key={group.month}>
        <h4>{/^\d{4}-\d{2}$/.test(group.month) ? `${group.month.slice(0,4)}년 ${Number(group.month.slice(5))}월` : group.month}</h4>
        <RecordMediaGrid items={group.items} onOpen={item => onOpen(item, pageItems)} />
      </div>) : <EmptyState text="이 지역에 담긴 사진과 영상이 아직 없어요." />}
      {pages > 1 && <nav className="memoryMapPager" aria-label="지역 사진 페이지">
        <button disabled={page === 0} onClick={() => setPage(current => current - 1)}><ChevronLeft size={17} />이전</button>
        <span>{page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(current => current + 1)}>다음<ChevronRight size={17} /></button>
      </nav>}
    </section>}
  </div>;
}
