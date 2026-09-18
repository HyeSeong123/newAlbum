import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, PawPrint, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useRowSelection } from '../../hooks/useRowSelection';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { deletePet, loadPets, Pet, savePet } from './petService';
import './pets.css';
import { PetMatchReview } from './PetMatchReview';
import { ScanSearch } from 'lucide-react';

export function PetsView({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState<Pet | null>(null);
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const desktop = isTauriRuntime();
  const photos = items.filter((item) => item.fileType === 'image');
  const pet = pets.find((entry) => entry.id === active);
  const linked = pet ? photos.filter((item) => pet.media_ids.includes(Number(item.id))) : [];
  const pages = Math.max(1, Math.ceil((pet ? linked.length : pets.length) / 24));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => {
    let alive = true;
    if (desktop) loadPets().then((result) => { if (alive) setPets(result); })
      .catch(() => { if (alive) setError('반려동물 정보를 불러오지 못했습니다.'); })
      .finally(() => { if (alive) setLoading(false); });
    else setLoading(false);
    return () => { alive = false; };
  }, [desktop, items]);
  async function remove() {
    if (!pet || busy || !window.confirm(`'${pet.name}' 등록을 삭제할까요? 원본 사진은 유지됩니다.`)) return;
    setBusy(true); setError('');
    try { await deletePet(pet.id); setPets(await loadPets()); setActive(null); setPage(0); }
    catch { setError('등록을 삭제하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <section className="petsView">
    <div className="panelHeader">
      <h2>{pet?.name ?? '반려동물'}</h2>
      <div className="peopleActions">
        {pet && <button disabled={busy || !linked.length} onClick={() => setReviewing(true)}><ScanSearch size={18} />후보 찾기</button>}
        {pet && <><button title="반려동물 목록" onClick={() => { setActive(null); setPage(0); }}><ArrowLeft size={18} /></button><button disabled={busy} onClick={() => setEditing(pet)}><Pencil size={18} />사진·이름 편집</button><button disabled={busy} onClick={() => void remove()}><Trash2 size={18} />등록 삭제</button></>}
        {!pet && <button disabled={loading || !desktop} onClick={() => setEditing({ id: 0, name: '', cover_media_id: null, media_ids: [] })}><Plus size={18} />반려동물 등록</button>}
      </div>
    </div>
    {!desktop && <p role="status">반려동물 등록은 데스크톱 앱에서 사용할 수 있습니다.</p>}
    {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />불러오는 중</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !(pet ? linked.length : pets.length) && <div className="emptyState"><PawPrint size={30} /><p>{pet ? '아직 연결한 사진이 없습니다.' : '아직 등록한 반려동물이 없습니다.'}</p></div>}
    <div className="petGrid">{pet ? linked.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button key={item.id} className="petPhoto" aria-label="사진 상세보기" onClick={() => onOpen(item)}><MediaVisual item={item} /><span>{item.takenAt ?? '날짜 없음'}</span></button>) : pets.slice(currentPage * 24, (currentPage + 1) * 24).map((entry) => {
      const cover = photos.find((item) => Number(item.id) === entry.cover_media_id) ?? photos.find((item) => entry.media_ids.includes(Number(item.id)));
      return <button className="petPhoto" key={entry.id} onClick={() => { setActive(entry.id); setPage(0); }}>
        {cover ? <MediaVisual item={cover} /> : <div className="petPlaceholder"><PawPrint size={48} /></div>}<strong>{entry.name}</strong><span>{entry.media_ids.length}장</span>
      </button>;
    })}</div>
    {pages > 1 && <div className="peopleActions"><button title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
    {editing && <PetEditor pet={editing} photos={photos} onClose={() => setEditing(null)} onSaved={async (id) => { setPets(await loadPets()); setActive(id); setPage(0); }} />}
    {reviewing && pet && <PetMatchReview pet={pet} photos={photos} onClose={() => setReviewing(false)} onSaved={async () => { setPets(await loadPets()); }} />}
  </section>;
}

function PetEditor({ pet, photos, onClose, onSaved }: { pet: Pet; photos: MediaItem[]; onClose: () => void; onSaved: (id: number) => Promise<void> }) {
  const [name, setName] = useState(pet.name);
  const [selected, setSelected] = useState(() => pet.media_ids.filter((id) => photos.some((photo) => Number(photo.id) === id)));
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
      await onSaved(id); onClose();
    } catch { setError('저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div className="modalBackdrop"><section className="petEditor" role="dialog" aria-modal="true" aria-labelledby="petEditorTitle">
    <header className="detailHeader"><strong id="petEditorTitle">{pet.id ? '반려동물 편집' : '반려동물 등록'}</strong><button className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <div className="petFields"><label>이름<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>대표 사진<select aria-label="대표 사진" value={actualCover ?? ''} disabled={!selected.length} onChange={(event) => setCover(Number(event.target.value))}>{!selected.length && <option value="">사진 없음</option>}{selected.map((id, i) => <option key={id} value={id}>{photos.find((photo) => Number(photo.id) === id)?.takenAt ?? '날짜 없음'} · {i + 1}</option>)}</select></label></div>
        <strong>사진 {selected.length}장 선택</strong>
        <div className="petGrid selecting" {...drag}>{photos.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} className="petPhoto" data-selection-id={item.id} aria-label="사진 선택" aria-pressed={selected.includes(Number(item.id))} onClick={() => toggle(item.id)}>
          <MediaVisual item={item} /><span className={`faceCheck ${selected.includes(Number(item.id)) ? 'checked' : ''}`} aria-hidden="true">{selected.includes(Number(item.id)) && <Check size={22} />}</span><span>{item.takenAt ?? '날짜 없음'}</span>
        </button>)}</div>
        {!photos.length && <p>등록된 사진이 없습니다.</p>}
        <div className="peopleActions">{pages > 1 && <><button type="button" title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button type="button" title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></>}
          <button type="submit" disabled={!name.trim()}>{busy ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}저장</button></div>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  </section></div>;
}
