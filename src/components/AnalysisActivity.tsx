import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Pause, Play, X } from 'lucide-react';
import type { PersonAnalysisProgress } from '../features/people/PeopleView';
import type { PetAnalysis } from '../features/pets/usePetAnalysis';
import './analysis-activity.css';

/** A non-modal status panel: browsing and scrolling stay available. */
export function AnalysisActivity({ person, pets, onShowResults }: { person: PersonAnalysisProgress | null; pets: PetAnalysis; onShowResults: (tab: 'people' | 'pets') => void }) {
  const [open, setOpen] = useState(false);
  const [dismissedPerson, setDismissedPerson] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const personKey = `${person?.message}|${person?.error}`;
  const showPerson = Boolean(person && (person.running || (person.message || person.error) && dismissedPerson !== personKey));
  const showPets = Boolean(pets.progress);
  const running = Boolean(person?.running || pets.progress?.running);
  useEffect(() => { if (!showPerson && !showPets) setOpen(false); }, [showPerson, showPets]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  if (!showPerson && !showPets) return null;
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="analysisActivity" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    {open && <section id="analysisActivityPanel" className="analysisActivityPanel" role="region" aria-label="분석 진행상황">
      <header><h2>분석 진행상황</h2><button type="button" aria-label="진행상황 접기" onClick={close}><X size={18} /></button></header>
      {showPerson && person && <article><h3>인물 분석</h3><p role="status">{person.error || person.message}</p>
        {person.running && <progress aria-label="인물 분석 진행" value={person.done} max={person.total || 1} />}
        <small>{person.done} / {person.total}장</small><div className="analysisActivityActions">
          {person.running ? <button type="button" onClick={person.cancel}><Pause size={16} />분석 중단</button> : <button type="button" onClick={() => { setDismissedPerson(personKey); }}>알림 닫기</button>}
          <button type="button" onClick={() => { onShowResults('people'); close(); }}>인물 보기</button>
        </div>
      </article>}
      {showPets && pets.progress && <article><h3>반려동물 분석</h3><p role="status">{pets.progress.message}</p>
        {pets.progress.running && <progress aria-label="반려동물 분석 진행" value={pets.progress.done} max={pets.progress.total || 1} />}
        <small>{pets.progress.done} / {pets.progress.total}장</small><div className="analysisActivityActions">
          {pets.progress.running ? <button type="button" onClick={pets.cancel}><Pause size={16} />분석 중단</button> : <>
            {pets.waiting > 0 && <button type="button" onClick={pets.resume}><Play size={16} />이어서 분석</button>}
            <button type="button" onClick={pets.dismiss}>알림 닫기</button>
          </>}
          <button type="button" onClick={() => { onShowResults('pets'); close(); }}>반려동물 보기</button>
        </div>
      </article>}
    </section>}
    <button ref={trigger} type="button" className="analysisActivityTrigger" aria-label={running ? '분석 중 · 진행상황 보기' : '분석 결과 · 진행상황 보기'} aria-expanded={open} aria-controls={open ? 'analysisActivityPanel' : undefined} onClick={() => setOpen(!open)}>
      {running ? <LoaderCircle size={22} className="spinIcon" aria-hidden="true" /> : <Check size={22} aria-hidden="true" />}
    </button>
  </div>;
}
