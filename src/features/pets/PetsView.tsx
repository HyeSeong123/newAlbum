import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, MoreVertical, PawPrint, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import { EmptyState } from '../../components/MediaVisual';
import { ActionMenu } from '../../components/ActionMenu';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useRowSelection } from '../../hooks/useRowSelection';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { deletePet, loadPets, Pet, savePet } from './petService';
import './pets.css';
import { PetRecognitionReview } from './PetRecognitionReview';
import { ScanSearch } from 'lucide-react';
import { VIEW_LABELS, type PetView } from './engine/types';
import { petCovers, petPhotos } from './petModel';

export function PetsView({ items, onOpen, query = "" }: { items: MediaItem[]; query?: string; onOpen: (item: MediaItem, collection?: MediaItem[]) => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState<Pet | null>(null);
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  const desktop = isTauriRuntime();
  const photos = useMemo(() => items.filter((item) => item.fileType === 'image'), [items]);
  const covers = useMemo(() => petCovers(photos, pets), [photos, pets]);
  const pet = pets.find((entry) => entry.id === active);
  const search = query.trim().toLocaleLowerCase();
  const matchingPets = useMemo(() => pets.filter((entry) => entry.name.toLocaleLowerCase().includes(search)), [pets, search]);
  useEffect(() => { setPage(0); setActive(null); }, [query]);
  const linked = useMemo(() => petPhotos(photos, pet), [photos, pet]);
  const pages = Math.max(1, Math.ceil((pet ? linked.length : matchingPets.length) / 24));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => {
    const header = heading.current;
    const navigationBottom = document.querySelector('.sidebar')?.getBoundingClientRect().bottom ?? 0;
    if (header && header.getBoundingClientRect().top < navigationBottom) header.scrollIntoView({ block: 'start' });
  }, [active]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (desktop) void loadPets().then((result) => { if (alive) setPets(result); })
        .catch(() => { if (alive) setError('반려동물 정보를 불러오지 못했습니다.'); })
        .finally(() => { if (alive) setLoading(false); });
      else setLoading(false);
    };
    refresh();
    window.addEventListener('gamjassak-pet-results',refresh);
    return () => { alive = false; window.removeEventListener('gamjassak-pet-results',refresh); };
  }, [desktop, items]);
  async function remove() {
    if (!pet || busy || !window.confirm(`'${pet.name}' 등록을 삭제할까요? 원본 사진은 유지됩니다.`)) return;
    setBusy(true); setError('');
    try { await deletePet(pet.id); setPets(await loadPets()); setActive(null); setPage(0); }
    catch { setError('반려동물 등록을 삭제하지 못했습니다. 사진과 등록 내용은 그대로 남아 있습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <section className="petsView">
    <div className="panelHeader entityHeader" ref={heading}>
      <div className="entityHeading">
        {pet && <button className="entityBack" aria-label="반려동물 목록" title="반려동물 목록" disabled={busy} onClick={() => { setActive(null); setPage(0); }}><ArrowLeft size={20} /></button>}
        <div className="entityHeadingCopy"><h2>{pet?.name ?? '반려동물'}</h2>{pet && <span>사진 {linked.length}장</span>}</div>
      </div>
      <div className="peopleActions entityActions">
        {pet && <><button className="primaryControl entityPrimary" aria-label="이름·사진 수정" disabled={busy} onClick={() => setEditing(pet)}><Pencil size={18} /><span className="entityActionFull">이름·사진 수정</span><span className="entityActionShort" aria-hidden="true">수정</span></button><ActionMenu label="반려동물 관리" icon={<MoreVertical size={20} />} disabled={busy} actions={[
          { label: '인식 기준·결과 확인', icon: <ScanSearch size={16} />, disabled: false, onSelect: () => setReviewing(true) },
          { label: '반려동물 등록 삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
        ]} /></>}
        {!pet && <button className="primaryControl entityPrimary" aria-label="반려동물 등록" disabled={loading || !desktop} onClick={() => setEditing({ id: 0, name: '', cover_media_id: null, media_ids: [] })}><Plus size={18} /><span className="entityActionFull">반려동물 등록</span><span className="entityActionShort" aria-hidden="true">등록</span></button>}
      </div>
    </div>
    {!desktop && <p role="status">반려동물 등록·인식은 감자싹 앱에서 사용할 수 있습니다.</p>}
    {desktop && !pet && <div className="peopleActions"><button onClick={() => setReviewing(true)}><ScanSearch size={18}/>반려동물 인식 결과 확인</button></div>}
    {desktop && pet && <p className="petMatchNotice">정면·왼쪽·오른쪽 측면·전신 사진을 연결한 뒤, 반려동물 관리의 인식 기준·결과 확인에서 방향과 개체를 확인해 주세요. 한 장으로도 등록할 수 있습니다.</p>}
    {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />반려동물 정보를 불러오는 중</p>}
    {error && <p role="alert">{error}</p>}
    {!pet && <div className="peopleSummary">등록된 반려동물 {pets.length}마리</div>}
    {!loading && !(pet ? linked.length : matchingPets.length) && <EmptyState icon={<PawPrint size={30} />} title={pet ? '아직 연결한 사진이 없습니다.' : query ? '검색한 이름의 반려동물이 없습니다.' : '아직 등록한 반려동물이 없습니다.'} description={pet ? '이름·사진 수정에서 사진을 선택해 주세요.' : query ? '다른 이름으로 검색하거나 반려동물을 등록해 보세요.' : '함께 찍은 사진을 골라 반려동물별로 모아볼 수 있습니다.'} actionLabel={desktop && !query ? pet ? '사진 연결하기' : '반려동물 등록하기' : undefined} onAction={desktop && !query ? () => setEditing(pet ?? { id: 0, name: '', cover_media_id: null, media_ids: [] }) : undefined} actionIcon={<Plus size={18} />} />}
    <div className="petGrid">{pet ? linked.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button key={item.id} className="petPhoto" aria-label="사진 상세보기" onClick={() => onOpen(item, linked)}><MediaVisual item={item} /><span>{item.takenAt ?? '날짜 없음'}</span></button>) : matchingPets.slice(currentPage * 24, (currentPage + 1) * 24).map((entry) => {
      const cover = covers.get(entry.id);
      return <button className="petPhoto" key={entry.id} onClick={() => { setActive(entry.id); setPage(0); }}>
        {cover ? <MediaVisual item={cover} /> : <div className="petPlaceholder"><PawPrint size={48} /></div>}<strong>{entry.name}</strong><span>{entry.media_ids.length}장</span>
      </button>;
    })}</div>
    {pages > 1 && <div className="peopleActions"><button title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
    {editing && <PetEditor pet={editing} photos={photos} onClose={() => setEditing(null)} onSaved={async (id) => { setPets(await loadPets()); setActive(id); setPage(0); }} />}
    {reviewing && <PetRecognitionReview pet={pet} photos={photos} onClose={() => setReviewing(false)} onSaved={async () => { setPets(await loadPets()); }} />}
  </section>;
}

function PetEditor({ pet, photos, onClose, onSaved }: { pet: Pet; photos: MediaItem[]; onClose: () => void; onSaved: (id: number) => Promise<void> }) {
  const [name, setName] = useState(pet.name);
  const [selected, setSelected] = useState(() => pet.media_ids.filter((id) => photos.some((photo) => Number(photo.id) === id)));
  const [referenceViews,setReferenceViews]=useState<Record<string,PetView>>({});
  const [cover, setCover] = useState(pet.cover_media_id);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (id: string) => setSelected((current) => current.includes(Number(id)) ? current.filter((entry) => entry !== Number(id)) : [...current, Number(id)]);
  const drag = useRowSelection(!busy, toggle, (id) => selected.includes(Number(id)));
  useModalBehavior(() => { if (!busy) onClose(); });
  const pages = Math.max(1, Math.ceil(photos.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const actualCover = cover !== null && selected.includes(cover) ? cover : selected[0] ?? null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const id = await savePet(pet.id || null, name.trim(), selected, actualCover);
      window.dispatchEvent(new CustomEvent('gamjassak-pet-enroll',{detail:{petId:id,items:photos.filter(photo=>selected.includes(Number(photo.id))).slice(0,12),views:referenceViews}}));
      await onSaved(id); onClose();
    } catch { setError('반려동물 정보를 저장하지 못했습니다. 입력한 이름과 선택한 사진은 화면에 남아 있습니다. 다시 저장해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div className="modalBackdrop"><section className="petEditor" role="dialog" aria-modal="true" aria-labelledby="petEditorTitle">
    <header className="detailHeader"><strong id="petEditorTitle">{pet.id ? '반려동물 편집' : '반려동물 등록'}</strong><button className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <div className="petFields"><label>이름<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>대표 사진<select aria-label="대표 사진" value={actualCover ?? ''} disabled={!selected.length} onChange={(event) => setCover(Number(event.target.value))}>{!selected.length && <option value="">사진 없음</option>}{selected.map((id, i) => <option key={id} value={id}>{photos.find((photo) => Number(photo.id) === id)?.takenAt ?? '날짜 없음'} · {i + 1}</option>)}</select></label></div>
        <strong>사진 {selected.length}장 선택</strong><p className="petMatchNotice">사진은 선택 사항입니다. 정면과 양쪽 측면 사진을 함께 연결하면 비교 기준을 보완할 수 있습니다.</p>
        <div className="petGrid selecting" {...drag}>{photos.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} className="petPhoto" data-selection-id={item.id} aria-label="사진 선택" aria-pressed={selected.includes(Number(item.id))} onClick={() => toggle(item.id)}>
          <MediaVisual item={item} /><span className={`faceCheck ${selected.includes(Number(item.id)) ? 'checked' : ''}`} aria-hidden="true">{selected.includes(Number(item.id)) && <Check size={22} />}</span><span>{item.takenAt ?? '날짜 없음'}</span>
        </button>)}</div>
        {selected.length > 0 && <details><summary>인식 기준 사진의 방향 (선택 사항 · 최대 12장)</summary><div className="petReferenceViews">{photos.filter(photo=>selected.includes(Number(photo.id))).slice(0,12).map(photo=><label key={photo.id}>{photo.fileName}<select aria-label={`${photo.fileName} 촬영 방향`} value={referenceViews[photo.id] ?? 'unknown'} onChange={event=>setReferenceViews(current=>({...current,[photo.id]:event.target.value as PetView}))}>{Object.entries(VIEW_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>)}</div></details>}
        {!photos.length && <p>등록된 사진이 없습니다.</p>}
        <div className="peopleActions">{pages > 1 && <><button type="button" title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button type="button" title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></>}
          <button type="submit" disabled={!name.trim()}>{busy ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}저장</button></div>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  </section></div>;
}
