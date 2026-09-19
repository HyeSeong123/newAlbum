import { useRef, useState } from 'react';
import { PawPrint, Users } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { PeopleView } from './PeopleView';
import { PetsView } from '../pets/PetsView';

export function PeopleWorkspace(props: { items: MediaItem[]; onOpen: (item: MediaItem) => void; onCreateAlbum: (items: MediaItem[]) => void }) {
  const [tab, setTab] = useState(0);
  const [petsVisited, setPetsVisited] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function select(next: number) {
    setTab(next);
    if (next === 1) setPetsVisited(true);
  }
  return <section className="peopleWorkspace">
    <div className="viewTabs" role="tablist" aria-label="인물 분류">
      {[{ label: '사람', Icon: Users }, { label: '반려동물', Icon: PawPrint }].map(({ label, Icon }, index) =>
        <button key={label} ref={(node) => { buttons.current[index] = node; }} id={`people-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`people-panel-${index}`} tabIndex={tab === index ? 0 : -1} className={tab === index ? 'active' : ''} onClick={() => select(index)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
          select(next); buttons.current[next]?.focus();
        }}><Icon size={18} />{label}</button>)}
    </div>
    <div id="people-panel-0" role="tabpanel" aria-labelledby="people-tab-0" hidden={tab !== 0}><PeopleView {...props} /></div>
    <div id="people-panel-1" role="tabpanel" aria-labelledby="people-tab-1" hidden={tab !== 1}>{petsVisited && <PetsView {...props} />}</div>
  </section>;
}
