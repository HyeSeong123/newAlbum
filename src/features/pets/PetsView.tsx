import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, MoreVertical, PawPrint, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import { EmptyState } from '../../components/MediaVisual';
import { ActionMenu } from '../../components/ActionMenu';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { useRowSelection } from '../../hooks/useRowSelection';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { deletePet, loadPets, Pet, savePet, renamePet, setPetCoverPhoto } from './petService';
import './pets.css';
import { PetPhotoSearch } from './PetPhotoSearch';
import type { PetAnalysis } from './usePetAnalysis';
import { ScanSearch } from 'lucide-react';
import { petCovers, petPhotos } from './petModel';
import { PetAnalysisStatus } from './PetAnalysisStatus';
import { EntitySelectionBar } from '../entities/EntitySelectionBar';
import { EntityAssignmentDialog } from '../entities/EntityAssignmentDialog';
import { editEntityPhotos, removeEntityRegistrations } from '../entities/entityService';
import { UnknownPets } from './UnknownPets';

export function PetsView({ items, onOpen, analysis, query = "", reviewRequested = false, onReviewHandled, isActive = true }: { isActive?: boolean; items: MediaItem[]; analysis: PetAnalysis; query?: string; reviewRequested?: boolean; onReviewHandled?: () => void; onOpen: (item: MediaItem, collection?: MediaItem[]) => void }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selecting,setSelecting]=useState(false), [chosen,setChosen]=useState<number[]>([]);
  const [assigning,setAssigning]=useState(false), [unknown,setUnknown]=useState(false);
  const [sort,setSort]=useState('name');
  useEffect(()=>{const close=()=>setSelecting(false);window.addEventListener('gamjassak-unknown-pet-selection-close',close);return()=>window.removeEventListener('gamjassak-unknown-pet-selection-close',close);},[]);
  const [editorMode,setEditorMode]=useState<'all'|'name'|'cover'|'photos'>('all');
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState<Pet | null>(null);
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (reviewRequested) { setActive(null); setPage(0); setReviewing(true); onReviewHandled?.(); } }, [reviewRequested, onReviewHandled]);
  const desktop = isTauriRuntime();
  const photos = useMemo(() => items.filter((item) => item.fileType === 'image'), [items]);
  const covers = useMemo(() => petCovers(photos, pets), [photos, pets]);
  const pet = pets.find((entry) => entry.id === active);
  const search = query.trim().toLocaleLowerCase();
  const matchingPets = useMemo(() => pets.filter((entry) => entry.name.toLocaleLowerCase().includes(search)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):b.media_ids.length-a.media_ids.length), [pets, search, sort]);
  useEffect(() => { setPage(0); setActive(null); setSelecting(false); setChosen([]); }, [query]);
  useEffect(()=>{setSelecting(false);setChosen([]);},[active,unknown]);
  useEffect(()=>{if(!isActive){setSelecting(false);setChosen([]);setAssigning(false);setEditing(null);setReviewing(false);}},[isActive]);
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
  const canRetrain = (pet ? linked.length > 0 : pets.some(entry => entry.media_ids.some(id => photos.some(photo => Number(photo.id) === id))));
  const toggle=(id:string)=>setChosen(current=>current.includes(Number(id))?current.filter(value=>value!==Number(id)):[...current,Number(id)]);
  const drag=useRowSelection(selecting && !busy,toggle,id=>chosen.includes(Number(id)));
  async function changePhotos(action:'move'|'unknown'|'exclude') {
    if(!pet || busy || !chosen.length)return;
    if(action==='exclude' && !window.confirm(`사진 ${chosen.length}장의 이 반려동물 연결만 제외할까요? 같은 사진의 다른 반려동물과 원본 사진은 유지됩니다.`))return;
    setBusy(true);setError('');
    try {await editEntityPhotos('pet',pet.id,chosen,action);setChosen([]);setPets(await loadPets());window.dispatchEvent(new Event('gamjassak-pet-results'));}
    catch(reason){setError(String(reason));}finally{setBusy(false);}
  }
  function editPet(mode:'all'|'name'|'cover'|'photos'){if(pet){setEditorMode(mode);setEditing(pet);}}
  function retrain() { analysis.retrain((pet ? [pet] : pets).map(entry => ({petId:entry.id,items:photos.filter(photo => entry.media_ids.includes(Number(photo.id)))}))); }
  async function remove() {
    if (!pet || busy || !window.confirm(`'${pet.name}'의 이름과 사진 연결을 삭제할까요? 인식 결과는 미확인 상태로 남고 원본 사진은 유지됩니다.`)) return;
    setBusy(true); setError('');
    try { await deletePet(pet.id); setPets(await loadPets()); setActive(null); setPage(0); }
    catch { setError('반려동물 등록을 삭제하지 못했습니다. 사진과 등록 내용은 그대로 남아 있습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <section className="petsView">
    <div className="panelHeader entityHeader" ref={heading}>
      <div className="entityHeading">
        {(pet || unknown) && <button className="entityBack" aria-label={selecting ? '선택 취소' : '반려동물 목록'} title={selecting ? '선택 취소' : '반려동물 목록'} disabled={busy} onClick={() => { if(selecting){setSelecting(false);setChosen([]);}else{setActive(null);setUnknown(false);setPage(0);} }}>{selecting ? <X size={20}/> : <ArrowLeft size={20} />}</button>}
        <div className="entityHeadingCopy"><h2>{unknown ? '미확인 반려동물' : pet?.name ?? '반려동물'}</h2>{pet && <span>사진 {linked.length}장</span>}</div>
      </div>
      <div className="peopleActions entityActions">
        {unknown && <button className="primaryControl" onClick={()=>{setSelecting(!selecting);}}>선택</button>}
        {pet && <><button className="primaryControl entityPrimary" aria-label="선택" disabled={busy || !linked.length} onClick={()=>{setSelecting(!selecting);setChosen([]);}}><Check size={18}/>선택</button><ActionMenu label="반려동물 관리" triggerText="더보기" icon={<MoreVertical size={20} />} disabled={busy} actions={[
          {label:'대표 사진 변경',disabled:!linked.length,onSelect:()=>editPet('cover')},
          {label:'이름·사진 수정',onSelect:()=>editPet('all')},
          { label: '등록 사진 다시 분석', icon: <RefreshCw size={16} />, disabled: !canRetrain || analysis.progress?.running, onSelect: retrain },
          { label: '반려동물 등록 삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
        ]} /></>}
        {!pet && !unknown && <button className="primaryControl entityPrimary" aria-label="반려동물 추가" disabled={loading || !desktop} onClick={() => {setEditorMode('all');setEditing({ id: 0, name: '', cover_media_id: null, media_ids: [] });}}><Plus size={18} /><span>반려동물 추가</span></button>}
        {!pet && desktop && pets.length > 0 && <ActionMenu label="반려동물 관리" triggerText="더보기" icon={<MoreVertical size={20} />} actions={[{label:'등록 사진 다시 분석',icon:<RefreshCw size={16} />,disabled:!canRetrain || analysis.progress?.running,onSelect:retrain}]} />}
      </div>
    </div>
    {!desktop && <p role="status">반려동물 등록·인식은 감자싹 앱에서 사용할 수 있습니다.</p>}
    {desktop && <div className="entityQuickActions">{pet ? <><button disabled={busy} onClick={()=>editPet('photos')}><Plus size={18}/>사진 연결</button><button disabled={busy} onClick={()=>editPet('name')}><Pencil size={18}/>이름 변경</button></> : <>{!unknown && <button disabled={busy || !matchingPets.length} onClick={()=>{setSelecting(!selecting);setChosen([]);}}>선택</button>}<button className={unknown?'active':''} onClick={()=>{setUnknown(true);setActive(null);}}>미확인 반려동물</button></>}</div>}
    {!pet && !unknown && <label className="entitySort">정렬<select aria-label="반려동물 정렬" value={sort} onChange={event=>setSort(event.target.value)}><option value="name">이름순</option><option value="photos">사진 많은 순</option></select></label>}
    {desktop && pets.length > 0 && <div className="petFindPhotos"><div><strong>{pet ? `${pet.name}의 다른 사진도 찾아보세요` : '반려동물 사진을 한곳에 모으세요'}</strong><p className="petMatchNotice">버튼을 누르면 연결한 사진과 비교해 비슷한 사진을 찾아요.</p></div><button disabled={loading || !photos.length} onClick={() => setReviewing(true)}><ScanSearch size={18}/>반려동물 사진 찾기</button></div>}
    {!reviewing && <PetAnalysisStatus analysis={analysis} onReview={() => setReviewing(true)} />}

    {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />반려동물 정보를 불러오는 중</p>}
    {error && <p role="alert">{error}</p>}
    {!pet && !unknown && <div className="peopleSummary">등록된 반려동물 {pets.length}마리</div>}
    {!unknown && !loading && !(pet ? linked.length : matchingPets.length) && <EmptyState icon={<PawPrint size={30} />} title={pet ? '아직 연결한 사진이 없습니다.' : query ? '검색한 이름의 반려동물이 없습니다.' : '아직 등록한 반려동물이 없습니다.'} description={pet ? '‘사진 연결’에서 사진을 선택해 주세요.' : query ? '다른 이름으로 검색하거나 반려동물을 등록해 보세요.' : '‘반려동물 추가’에서 이름과 사진을 골라 주세요. 분석은 원할 때 시작할 수 있어요.'} />}
    {unknown && <UnknownPets selecting={selecting} onOpen={onOpen} photos={photos} pets={pets} onSaved={async()=>setPets(await loadPets())}/>}
    {!unknown && <div className="petGrid" {...drag}>{pet ? linked.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button key={item.id} className="petPhoto" data-selection-id={item.id} aria-label={selecting ? '사진 선택' : '사진 상세보기'} aria-pressed={selecting ? chosen.includes(Number(item.id)) : undefined} onClick={() => selecting ? toggle(item.id) : onOpen(item, linked)}><MediaVisual item={item} />{selecting && <span className={`faceCheck ${chosen.includes(Number(item.id))?'checked':''}`} aria-hidden="true">{chosen.includes(Number(item.id)) && <Check size={22}/>}</span>}<span>{item.takenAt ?? '날짜 없음'}</span></button>) : matchingPets.slice(currentPage * 24, (currentPage + 1) * 24).map((entry) => {
      const cover = covers.get(entry.id);
      return <button className="petPhoto" aria-label={`${entry.name} ${entry.media_ids.length}장`} key={entry.id} data-selection-id={entry.id} aria-pressed={selecting?chosen.includes(entry.id):undefined} onClick={() => { if(selecting)toggle(String(entry.id));else {setActive(entry.id);setPage(0);} }}>
        {cover ? <MediaVisual item={cover} /> : <div className="petPlaceholder"><PawPrint size={48} /></div>}<strong>{entry.name}</strong>{selecting && <span className={`faceCheck ${chosen.includes(entry.id)?'checked':''}`} aria-hidden="true">{chosen.includes(entry.id) && <Check size={22}/>}</span>}<span>{entry.media_ids.length}장</span>
      </button>;
    })}</div>}
    {!unknown && pages > 1 && <div className="peopleActions"><button title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
    {!pet && !unknown && selecting && <EntitySelectionBar count={chosen.length} unit="반려동물" busy={busy} onAll={()=>setChosen(matchingPets.map(entry=>entry.id))} onClear={()=>setChosen([])} onClose={()=>{setSelecting(false);setChosen([]);}}>
      <button disabled={busy || !chosen.length} onClick={async()=>{if(!window.confirm(`반려동물 ${chosen.length}마리의 이름과 사진 연결을 삭제할까요? 인식 결과는 미확인 상태로 남고 원본 사진은 유지됩니다.`))return;setBusy(true);setError('');try{await removeEntityRegistrations('pet',chosen);setChosen([]);setPets(await loadPets());setSelecting(false);}catch(reason){setError(String(reason));}finally{setBusy(false);}}}>반려동물 등록 삭제</button>
    </EntitySelectionBar>}
    {pet && selecting && <EntitySelectionBar count={chosen.length} unit="사진" busy={busy} onAll={()=>setChosen(linked.map(item=>Number(item.id)))} onClear={()=>setChosen([])} onClose={()=>{setSelecting(false);setChosen([]);}}>
      <button className="primaryControl" disabled={busy || !chosen.length} onClick={()=>setAssigning(true)}>다른 반려동물로 변경</button>
      <button disabled={busy || !chosen.length} onClick={()=>void changePhotos('unknown')}>미확인 상태로 변경</button>
      <button disabled={busy || !chosen.length} onClick={()=>void changePhotos('exclude')}>이 반려동물에서 제외</button>
    </EntitySelectionBar>}
    {assigning && pet && <EntityAssignmentDialog kind="pet" entries={pets.filter(entry=>entry.id!==pet.id)} count={chosen.length} unit="사진" onClose={()=>setAssigning(false)} onSave={async value=>{
      await editEntityPhotos('pet',pet.id,chosen,'move',value);setChosen([]);try{setPets(await loadPets());}catch{setError('저장은 완료했지만 목록을 갱신하지 못했습니다. 반려동물 메뉴를 다시 열어 주세요.');}window.dispatchEvent(new Event('gamjassak-pet-results'));
    }}/>}
    {editing && <PetEditor pet={editing} mode={editorMode} photos={photos} onClose={() => setEditing(null)} onSaved={async (id) => { setPets(await loadPets()); setActive(id); setPage(0); }} />}
    {reviewing && <PetPhotoSearch pet={pet} pets={pets} photos={photos} analysis={analysis} onClose={() => setReviewing(false)} onSaved={async () => { setPets(await loadPets()); }} />}

  </section>;
}

function PetEditor({ pet, photos, mode='all', onClose, onSaved }: { mode?: 'all'|'name'|'cover'|'photos'; pet: Pet; photos: MediaItem[]; onClose: () => void; onSaved: (id: number) => Promise<void> }) {
  const [name, setName] = useState(pet.name);
  const savedId=useRef<number|null>(pet.id || null), savingLock=useRef(false);
  const [selected, setSelected] = useState(() => [...pet.media_ids]);
  const [cover, setCover] = useState(pet.cover_media_id);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (id: string) => setSelected((current) => current.includes(Number(id)) ? current.filter((entry) => entry !== Number(id)) : [...current, Number(id)]);
  const drag = useRowSelection(!busy && mode!=='cover', toggle, (id) => selected.includes(Number(id)));
  const availablePhotos = mode==='cover'?photos.filter(photo=>selected.includes(Number(photo.id))):photos;
  const pages = Math.max(1, Math.ceil(availablePhotos.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const actualCover = cover !== null && selected.includes(cover) ? cover : selected[0] ?? null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingLock.current || !name.trim()) return;
    savingLock.current=true;setBusy(true); setError('');
    try {
      const id = mode==='name' && pet.id ? await renamePet(pet.id,name.trim()) : mode==='cover' && pet.id && actualCover!==null ? await setPetCoverPhoto(pet.id,actualCover) : await savePet(savedId.current, name.trim(), selected, actualCover);
      savedId.current=id;
      await onSaved(id); onClose();
    } catch { setError('반려동물 정보를 저장하지 못했습니다. 입력한 이름과 선택한 사진은 화면에 남아 있습니다. 다시 저장해 주세요.'); }
    finally { savingLock.current=false;setBusy(false); }
  }
  return <EntityEditorDialog title={mode==='name'?'이름 변경':mode==='cover'?'대표 사진 변경':mode==='photos'?'사진 연결':pet.id?'반려동물 편집':'반려동물 추가'} busy={busy} onClose={onClose} className="petRegistrationEditor">
    <form onSubmit={(event) => void submit(event)}>
      <div className="entityEditBody"><fieldset disabled={busy}>
        <div className="petFields">{(mode==='all' || mode==='name') && <label className="entityEditField">이름<input placeholder="반려동물 이름" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>}
        {(mode==='all' || mode==='cover') && <label className="entityEditField">대표 사진<select aria-label="대표 사진" value={actualCover ?? ''} disabled={!selected.length} onChange={(event) => setCover(Number(event.target.value))}>{!selected.length && <option value="">사진 없음</option>}{selected.map((id, i) => <option key={id} value={id}>{photos.find((photo) => Number(photo.id) === id)?.takenAt ?? '날짜 없음'} · {i + 1}</option>)}</select></label>}</div>
        {mode!=='name' && <><div className="petPhotoSelectionHeading"><strong>연결할 사진</strong><span>{selected.length}장 선택</span></div><p className="petMatchNotice">{mode==='cover'?'대표로 사용할 사진을 누르세요.':'사진을 눌러 연결하거나 해제하세요. 원본 사진은 유지됩니다.'}</p>
        {mode!=='cover' && <div className="peopleActions"><button type="button" onClick={()=>setSelected(photos.map(photo=>Number(photo.id)))}>전체 선택</button><button type="button" disabled={!selected.length} onClick={()=>setSelected([])}>선택 해제</button></div>}
        <div className="petGrid selecting" {...drag}>{availablePhotos.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} className="petPhoto" data-selection-id={item.id} aria-label={mode==='cover'?'대표 사진으로 설정':'사진 선택'} aria-pressed={mode==='cover'?actualCover===Number(item.id):selected.includes(Number(item.id))} onClick={() => mode==='cover'?setCover(Number(item.id)):toggle(item.id)}>
          <MediaVisual item={item} /><span className={`faceCheck ${(mode==='cover'?actualCover===Number(item.id):selected.includes(Number(item.id))) ? 'checked' : ''}`} aria-hidden="true">{(mode==='cover'?actualCover===Number(item.id):selected.includes(Number(item.id))) && <Check size={22} />}</span><span>{item.takenAt ?? '날짜 없음'}</span>
        </button>)}</div>
        <p className="petMatchNotice">저장하면 이름과 사진만 연결해요. 분석하려면 저장 후 ‘반려동물 사진 찾기’를 눌러 주세요.</p>
        {!photos.length && <p>등록된 사진이 없습니다.</p>}
        <div className="peopleActions">{pages > 1 && <><button type="button" title="이전 페이지" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button type="button" title="다음 페이지" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></>}
        </div>
        </>}
        {error && <p role="alert">{error}</p>}
      </fieldset></div>
      <footer className="peopleActions entityEditFooter"><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="primaryControl" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}저장</button></footer>
    </form>
  </EntityEditorDialog>;
}
