import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BookHeart, CalendarDays, MapPin, X } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { Memories } from "./Memories";
import { TimelineView } from "../timeline/TimelineView";
import { TripDiscovery } from "./TripDiscovery";

const MemoryMap = lazy(() => import("../map/MemoryMap").then(module => ({ default: module.MemoryMap })));
const sections = { rediscover: "그날 다시", timeline: "시간 산책", map: "추억 지도" };
const sectionIcons = { rediscover: BookHeart, timeline: CalendarDays, map: MapPin };

export function MemoriesWorkspace({ items, allItems, today, query = "", onClearSearch, onOpen, onShowLibrary, onAssignRegion, onCreateAlbum, onLocationsAnalyzed, onSectionChange }: {
  items: MediaItem[]; allItems: MediaItem[]; today: string;
  query?: string; onClearSearch?: () => void;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onShowLibrary: () => void;
  onAssignRegion: (ids: string[], code: string, district?: string, country?: string, city?: string) => Promise<void>;
  onCreateAlbum: (items: MediaItem[], title?: string) => void;
  onLocationsAnalyzed: () => Promise<void>;
  onSectionChange?: (section: keyof typeof sections) => void;
}) {
  const [section, setSection] = useState<keyof typeof sections>("rediscover");
  const [detail, setDetail] = useState<'memory' | 'trip' | null>(null);
  const memoryDetail = useCallback((active: boolean) => setDetail(current => active ? 'memory' : current === 'memory' ? null : current), []);
  const tripDetail = useCallback((active: boolean) => setDetail(current => active ? 'trip' : current === 'trip' ? null : current), []);
  const sectionChange = useRef(onSectionChange);
  sectionChange.current = onSectionChange;
  useEffect(() => { sectionChange.current?.(section); }, [section]);
  return <div className="memoriesWorkspace">
    <div className="memoryPeriod memorySectionTabs" role="group" aria-label="추억 보기">
      {(Object.keys(sections) as Array<keyof typeof sections>).map(key => { const Icon = sectionIcons[key]; return <button key={key} aria-pressed={section === key} onClick={() => { setSection(key); }}><Icon size={17} aria-hidden="true" />{sections[key]}</button>; })}
    </div>
    {section !== "map" && query.trim() && <div className="memorySearchNotice"><span>‘{query}’에 담긴 추억</span><button type="button" onClick={onClearSearch}><X size={16} aria-hidden="true" />모든 추억 보기</button></div>}
    {section === "rediscover" && <><div hidden={detail === 'trip'}><Memories items={items} today={today} query={query} onDetailChange={memoryDetail} onOpen={onOpen} onShowLibrary={onShowLibrary} /></div>
      <div hidden={detail === 'memory'}><TripDiscovery items={allItems} visibleItems={items} onDetailChange={tripDetail} onOpen={onOpen} onCreateAlbum={onCreateAlbum} /></div></>}
    {section === "timeline" && <TimelineView items={items} onOpen={onOpen} />}
    {section === "map" && <Suspense fallback={<p role="status">추억 지도를 불러오는 중</p>}>
      <MemoryMap items={allItems} onOpen={onOpen} onShowLibrary={onShowLibrary} onAssignRegion={onAssignRegion} onCreateAlbum={onCreateAlbum} onLocationsAnalyzed={onLocationsAnalyzed} />
    </Suspense>}
  </div>;
}
