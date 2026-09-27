import { lazy, Suspense, useState } from "react";
import type { MediaItem } from "../../types/media";
import { Memories } from "./Memories";
import { TimelineView } from "../timeline/TimelineView";

const MemoryMap = lazy(() => import("../map/MemoryMap").then(module => ({ default: module.MemoryMap })));
const sections = { rediscover: "다시 만난 추억", timeline: "우리의 기록", map: "추억 지도" };

export function MemoriesWorkspace({ items, allItems, today, onOpen, onAssignRegion, onCreateAlbum, onLocationsAnalyzed }: {
  items: MediaItem[]; allItems: MediaItem[]; today: string;
  onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  onAssignRegion: (ids: string[], code: string) => Promise<void>;
  onCreateAlbum: (items: MediaItem[], title?: string) => void;
  onLocationsAnalyzed: () => Promise<void>;
}) {
  const [section, setSection] = useState<keyof typeof sections>("rediscover");
  return <div className="memoriesWorkspace">
    <div className="memoryPeriod" role="group" aria-label="추억 보기">
      {(Object.keys(sections) as Array<keyof typeof sections>).map(key => <button key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{sections[key]}</button>)}
    </div>
    {section === "rediscover" && <Memories items={items} today={today} onOpen={onOpen} />}
    {section === "timeline" && <TimelineView items={items} onOpen={onOpen} />}
    {section === "map" && <Suspense fallback={<p role="status">추억 지도를 펼치는 중이에요.</p>}>
      <MemoryMap items={allItems} onOpen={onOpen} onAssignRegion={onAssignRegion} onCreateAlbum={onCreateAlbum} onLocationsAnalyzed={onLocationsAnalyzed} />
    </Suspense>}
  </div>;
}
