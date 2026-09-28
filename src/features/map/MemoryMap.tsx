import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Image, MapPin, RefreshCw, Video } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { EmptyState } from "../../components/MediaVisual";
import { RegionGallery } from "./RegionGallery";
import { analyzeLocationBatch, isTauriRuntime, loadLocationOverview, queueFailedLocations, type LocationOverview } from "../../services/tauriMediaService";
import { MAP_REGIONS, REGION_LABELS, REGION_NAMES, totalFor } from "./regionModel";
import { browserLocationOverview } from "./memoryMapModel";
import "./memory-map.css";

const EMPTY_OVERVIEW = browserLocationOverview([], REGION_NAMES);

export function MemoryMap({ items, onOpen, onAssignRegion, onCreateAlbum, onLocationsAnalyzed, onShowLibrary }: {
  items: MediaItem[]; onOpen: (item: MediaItem, collection: MediaItem[]) => void;
  onAssignRegion: (ids: string[], code: string, district?: string, country?: string, city?: string) => Promise<void>;
  onCreateAlbum: (items: MediaItem[], title?: string) => void;
  onLocationsAnalyzed: () => Promise<void>;
  onShowLibrary: () => void;
}) {
  const [overview, setOverview] = useState<LocationOverview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overviewError, setOverviewError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [focusVersion, setFocusVersion] = useState(0);
  const origin = useRef<HTMLElement | SVGElement | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const desktop = isTauriRuntime();
  const fallback = useMemo(() => desktop ? EMPTY_OVERVIEW : browserLocationOverview(items, REGION_NAMES), [desktop, items]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!desktop || busy) return;
    let disposed = false;
    void loadLocationOverview().then(value => { if (!disposed) { setOverview(value); setOverviewError(""); } })
      .catch(() => { if (!disposed) setOverviewError("위치 정보를 불러오지 못했습니다."); });
    return () => { disposed = true; };
  }, [desktop, items, refresh, busy]);

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
      await onLocationsAnalyzed();
    } catch { if (alive.current) setError("위치 정보를 읽는 중 문제가 발생했습니다. 이미 등록된 사진과 확인한 지역은 그대로 남아 있습니다. 다시 시도해 주세요."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }

  function select(code: string, control: HTMLElement | SVGElement) {
    origin.current = control;
    setSelected(code); setHovered(null); setFocusVersion(value => value + 1);
  }
  function closeGallery() {
    setSelected(null); setHovered(null);
    origin.current?.focus({ preventScroll: true });
    origin.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }
  const initialLoading = desktop && !overview;

  const shown = desktop ? overview ?? EMPTY_OVERVIEW : fallback;
  const covered = shown.regions.filter(region => REGION_NAMES[region.code] && region.photos + region.videos > 0).length;
  const located = shown.regions.reduce((sum, region) => sum + region.photos + region.videos, 0);
  const activeRegion = hovered ?? selected;
  const summary = MAP_REGIONS.find(region => region.code === activeRegion);
  const summaryCount = shown.regions.find(region => region.code === activeRegion);
  const hasMappedRecord = located > 0 || items.some(item => item.regionCode === "overseas");
  const chooseUnclassified = () => { setSelected("unclassified"); setHovered(null); setFocusVersion(value => value + 1); };

  return <div className="memoryMap">
    <section className="memoryMapIntro" aria-label="추억 지도 요약">
      <div className="memoryMapIntroText"><span className="memoryMapEyebrow"><Compass size={16} />나의 추억 지도</span>
        <h2>사진이 남긴 곳, 다시 펼쳐보기</h2>
        <p>{initialLoading ? "사진에 담긴 지역 정보를 확인하고 있어요." : `16개 지역 중 ${covered}개 지역에 기록이 있어요. 지도에서 지역을 골라 그날의 사진을 만나보세요.`}</p></div>
      {!initialLoading && <div className="memoryMapIntroActions">
        <div className="memoryMapStats"><div><strong>{located.toLocaleString()}</strong><span>위치가 있는 기록</span></div><div><strong>{shown.unclassified.toLocaleString()}</strong><span>지역 미분류</span></div></div>
        <button className="memoryMapAutoButton" disabled={!desktop || busy || (shown.pending === 0 && shown.failed === 0)}
          title={!desktop ? "자동 조회는 데스크톱 앱에서 사용할 수 있어요" : shown.pending === 0 && shown.failed === 0 ? "새로 조회할 기록이 없습니다" : undefined}
          onClick={() => void analyze(shown.pending === 0 && shown.failed > 0)}><RefreshCw size={16} className={busy ? "spinIcon" : ""} />{busy ? `위치 정보를 확인하는 중 ${shown.analyzed.toLocaleString()} / ${shown.total.toLocaleString()}개` : "위치 정보 분석하기"}</button>
      </div>}
    </section>
    {overviewError && <div className="memoryMapAlert" role="alert">{overviewError}
      <button disabled={busy} onClick={() => { setOverviewError(""); setRefresh(value => value + 1); }}>지도 다시 불러오기</button>
    </div>}
    {initialLoading && !overviewError && <p role="status">사진의 위치 정보를 불러오는 중</p>}
    {error && <p className="memoryMapAlert" role="alert">{error}</p>}
    {!initialLoading && !hasMappedRecord && <div className="memoryMapEmpty">
      <EmptyState icon={<MapPin size={32} />} title="아직 지도에 표시할 기록이 없습니다."
        description={items.length ? "휴대폰으로 찍은 사진에는 촬영 위치가 저장되어 있을 수 있습니다." : "사진을 가져오면 촬영 위치를 확인해 지도에 표시할 수 있습니다."}
        actionLabel={items.length ? shown.pending || shown.failed ? "위치 정보 분석하기" : shown.unclassified ? "지역 미분류 사진 보기" : "사진 기록 보기" : "사진 기록 보기"}
        onAction={items.length ? shown.pending || shown.failed ? () => void analyze(shown.pending === 0) : shown.unclassified ? chooseUnclassified : onShowLibrary : onShowLibrary}
        actionIcon={<MapPin size={18} />} />
      {shown.unclassified > 0 && (shown.pending > 0 || shown.failed > 0) && <button className="memoryMapUnclassified" onClick={chooseUnclassified}>지역 미분류 사진 보기 · 직접 지역 지정</button>}
      {shown.failed > 0 && <p role="status">{shown.failed}개 사진의 위치를 읽지 못했습니다. 사진은 정상적으로 등록되어 있습니다.</p>}
      {shown.unclassified > 0 && <p>위치가 없는 사진은 직접 지역을 지정할 수 있습니다.</p>}
    </div>}
    {!initialLoading && <section className="memoryMapLayout" aria-label="대한민국 추억 분포">
      <div className="memoryMapPaper">
        <div className="memoryMapPaperHead"><div><span className="memoryMapEyebrow">우리의 장소들</span><h3>대한민국</h3></div><span>시·도별 기록</span></div>
        <svg className="memoryMapShape" viewBox="0 0 500 535" role="group" aria-label="대한민국 시·도 선택 지도">
          {MAP_REGIONS.map(region => {
            const amount = totalFor(shown, region.code);
            return <path key={region.code} d={region.path} fillRule="evenodd"
              className={`memoryMapRegion ${amount ? "has-records" : ""} ${selected === region.code ? "selected" : ""} ${hovered === region.code ? "hovered" : ""}`}
              role="button" tabIndex={0} aria-label={`${region.name} 총 ${amount}개`}
              aria-pressed={selected === region.code}
              onClick={event => select(region.code, event.currentTarget)} onMouseEnter={() => setHovered(region.code)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(region.code)} onBlur={() => setHovered(null)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(region.code, event.currentTarget); } }}>
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
        <div className="memoryMapPlacesHead"><h3>지역별 기록</h3><span>{covered} / 16개 지역</span></div>
        <div className="memoryMapPlaceList">{MAP_REGIONS.map(region => {
          const total = totalFor(shown, region.code);
          return <button key={region.code} aria-pressed={selected === region.code} className={total ? "has-records" : ""} onClick={event => select(region.code, event.currentTarget)}>
            <span>{REGION_LABELS[region.code]}</span><strong>{total.toLocaleString()}</strong>
          </button>;
        })}</div>
        <button className="memoryMapUnclassified" aria-pressed={selected === "overseas"} onClick={event => select("overseas", event.currentTarget)}>
          <MapPin size={16} /><span>해외 지역</span><strong>{items.filter(item => item.regionCode === "overseas").length.toLocaleString()}</strong>
        </button>
        <button className="memoryMapUnclassified" aria-pressed={selected === "unclassified"} onClick={event => select("unclassified", event.currentTarget)}>
          <MapPin size={16} /><span>지역 미분류</span><strong>{shown.unclassified.toLocaleString()}</strong>
        </button>
        <div className="memoryMapAnalysis">
          <div className="memoryMapAnalysisHeader"><strong>위치 정보 분석</strong><span aria-live="polite">{shown.analyzed.toLocaleString()} / {shown.total.toLocaleString()}</span></div>
          <progress aria-label="위치 정보 분석 진행" value={shown.analyzed} max={Math.max(1, shown.total)} />
          {shown.failed > 0 && <span className="memoryMapAnalysisFailure">위치 정보 읽기 실패 {shown.failed}개 · 사진은 그대로 보관됩니다</span>}
        </div>
      </aside>
    </section>}
    {selected && <RegionGallery key={selected} code={selected} focusVersion={focusVersion} items={items} revision={shown.analyzed}
      summary={selected === "unclassified" ? "GPS가 없거나 위치를 확인할 수 없는 기록이에요. 직접 지역을 지정할 수 있어요." : selected === "overseas" ? "나라와 도시를 직접 지정한 기록이에요." : `${shown.regions.find(region => region.code === selected)?.photos ?? 0}장의 사진 · ${shown.regions.find(region => region.code === selected)?.videos ?? 0}개의 영상`}
      onOpen={onOpen} onClose={closeGallery} onAssignRegion={onAssignRegion} onCreateAlbum={onCreateAlbum} />}
  </div>;
}
