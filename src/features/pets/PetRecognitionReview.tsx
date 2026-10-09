import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { MediaVisual } from '../../components/MediaVisual';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import type { MediaItem } from '../../types/media';
import { loadPets, savePet, type Pet } from './petService';
import { confirmPetDetection, getPetScan, listPetDetections, loadPetReferences, scanPetBatch, type PetProgress } from './engine/manager';
import { recognizePet, withView } from './engine/matcher';
import { VIEW_LABELS, type PetDetection, type PetReference, type PetView } from './engine/types';
import './pets.css';

function DetectionCard({ detection, item, pets, references, preferredPet, onSaved }: {
  detection: PetDetection; item: MediaItem; pets: Pet[]; references: PetReference[]; preferredPet?: Pet; onSaved: () => Promise<void>;
}) {
  const [view, setView] = useState<PetView>(detection.view);
  const [chosen, setChosen] = useState(detection.pet_id !== null ? String(detection.pet_id) : preferredPet?.media_ids.includes(detection.media_id) ? String(preferredPet.id) : '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const result = recognizePet(withView(detection,view), references.filter(reference => (reference.features as PetDetection).id !== detection.id));
  const [x,y,w,h] = detection.box;
  async function save(excluded = false) {
    if (locked.current) return;
    if (!excluded && chosen === 'new' && !name.trim()) {setError('새 반려동물의 이름을 입력해 주세요.');return;}
    locked.current = true; setBusy(true);setError('');
    try {
      const id = excluded ? null : chosen === 'new' ? await savePet(null,name.trim(),[detection.media_id],detection.media_id) : chosen ? Number(chosen) : null;
      await confirmPetDetection(detection.id,id,view,excluded);
      window.dispatchEvent(new Event('gamjassak-pet-results'));
      await onSaved();
    } catch (reason) {setError(typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '확인 내용을 저장하지 못했습니다.');}
    finally {locked.current = false;setBusy(false);}
  }
  const state = detection.excluded ? '탐지 제외 · 변경 가능' : detection.pet_id !== null ? '연결 완료 · 변경 가능' : view === 'rear' ? '뒷모습 분석 · 확인 필요' : result.candidates.length ? '반려동물 확인 필요' : '미등록 후보 · 직접 확인';
  return <article className="petDetectionCard">
    <div className="petDetectionPreview"><MediaVisual item={item} fit="cover" /><span className="petDetectionBox" style={{left:`${x*100}%`,top:`${y*100}%`,width:`${w*100}%`,height:`${h*100}%`}} />
      <span className="petDetectionTag">{detection.kind === 'dog' ? '강아지' : '고양이'}</span></div>
    <div className="petDetectionFields">
      <strong>{state}</strong>
      <small>{item.fileName}</small>
      <label>촬영 방향<select aria-label="촬영 방향" disabled={busy} value={view} onChange={event => setView(event.target.value as PetView)}>{Object.entries(VIEW_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <p className="petMatchNotice">{view === 'rear' ? '체형·색상 유사 후보만 비교합니다. 같은 반려동물인지 직접 확인해 주세요.' : view === 'unknown' ? '방향을 확인하지 못했습니다. 사진에서 방향과 반려동물을 직접 선택해 주세요.' : '외형 특징을 비교한 후보입니다. 같은 반려동물인지 직접 확인해 주세요.'}</p>
      {result.candidates.length > 0 && <p className="petMatchNotice">유사 후보: {result.candidates.map(candidate => `${pets.find(pet => pet.id===candidate.petId)?.name ?? '삭제된 등록'} (${candidate.basis === 'shape-color' ? '체형·색상' : '외형'})`).join(', ')}</p>}
      <label>반려동물<select aria-label="인식된 반려동물" disabled={busy} value={chosen} onChange={event => setChosen(event.target.value)}><option value="">미확인 / 연결 해제</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}<option value="new">새 반려동물 등록</option></select></label>
      {chosen === 'new' && <label>새 반려동물 이름<input aria-label="새 반려동물 이름" disabled={busy} maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label>}
      <div className="peopleActions"><button disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="spinIcon" /> : null}확인 저장</button><button disabled={busy} onClick={() => void save(true)}>반려동물 아님</button></div>
      {error && <p role="alert">{error}</p>}
    </div>
  </article>;
}

export function PetRecognitionReview({ photos, pet, onClose, onSaved }: { photos: MediaItem[]; pet?: Pet; onClose: () => void; onSaved: () => Promise<void> }) {
  const [rows,setRows] = useState<PetDetection[]>([]), [pets,setPets] = useState<Pet[]>([]), [references,setReferences] = useState<PetReference[]>([]);
  const [page,setPage] = useState(0), [hasNext,setHasNext] = useState(false), [error,setError] = useState('');
  const cursors = useRef([0]);
  const [progress,setProgress] = useState<PetProgress | null>(null);
  const abort = useRef<AbortController | null>(null), alive = useRef(true);
  const refresh = useCallback(async () => {
    const [all,registered,refs] = await Promise.all([listPetDetections(null,cursors.current[page] ?? 0,false,24),loadPets(),loadPetReferences()]);
    if (!alive.current) return;
    const results = all ?? [];
    setHasNext(results.length===24); cursors.current[page+1] = results.at(-1)?.id ?? 0;
    setRows(results);setPets(registered);setReferences(refs);
  },[page]);
  useEffect(() => {
    alive.current=true;
    const update=()=>void refresh().catch(()=>{if(alive.current)setError('인식 결과를 불러오지 못했습니다.');});
    update();window.addEventListener('gamjassak-pet-results',update);
    return()=>{alive.current=false;abort.current?.abort();window.removeEventListener('gamjassak-pet-results',update);};
  },[refresh]);
  useModalBehavior(onClose);
  async function start() {
    if (abort.current) return;
    abort.current=new AbortController();setError('');
    try {await scanPetBatch(photos,abort.current.signal,value=>{if(alive.current)setProgress(value);});await refresh();}
    catch(reason){if(alive.current)setError(reason instanceof Error ? reason.message : String(reason));}
    finally{abort.current=null;}
  }
  const byId = new Map(photos.map(item=>[Number(item.id),item]));
  return <div className="modalBackdrop"><section className="petEditor" role="dialog" aria-modal="true" aria-label={pet ? `${pet.name} 인식 기준·결과 확인` : '반려동물 인식 결과 확인'}>
    <header className="detailHeader"><strong>{pet ? `${pet.name} 인식 기준·결과 확인` : '반려동물 인식 결과 확인'}</strong><button title="닫기" className="closeButton" onClick={onClose}><X size={18}/></button></header>
    <div className="petMatchBody"><p className="petMatchNotice">사진에서 테두리로 표시된 동물을 확인해 주세요. 확인한 사진이 다음 비교의 기준으로 추가됩니다.</p>
      <div className="peopleActions">{progress?.running ? <button onClick={()=>abort.current?.abort()}>분석 중단</button> : <button onClick={()=>void start()}>사진 분석</button>}<span role="status">{progress?.message}</span></div>
      {progress?.running && <progress aria-label="반려동물 분석 진행" value={progress.done} max={progress.total || 1}/>}
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>아직 확인할 결과가 없습니다. 사진 분석을 시작해 주세요.</p>}
      {rows.map(row=>{const item=byId.get(row.media_id);return item ? <DetectionCard key={`${row.id}:${row.pet_id}:${row.view}`} detection={row} item={item} pets={pets} references={references} preferredPet={pet} onSaved={async()=>{await refresh();await onSaved();}}/> : null;})}
      <div className="peopleActions"><button title="이전 결과" disabled={!page || !!progress?.running} onClick={()=>setPage(page-1)}><ChevronLeft size={18}/></button><span>{page+1}</span><button title="다음 결과" disabled={!hasNext || !!progress?.running} onClick={()=>setPage(page+1)}><ChevronRight size={18}/></button></div>
    </div>
  </section></div>;
}

export function PetPhotoResults({ item }: { item: MediaItem }) {
  const [rows,setRows]=useState<PetDetection[]>([]), [pets,setPets]=useState<Pet[]>([]), [references,setReferences]=useState<PetReference[]>([]);
  const [review,setReview]=useState(false), [error,setError]=useState('');
  const alive=useRef(true);
  const refresh=useCallback(async()=>{
    const [scan,registered,refs]=await Promise.all([getPetScan(Number(item.id)),loadPets(),loadPetReferences()]);
    if(alive.current){setRows(scan?.detections.filter(d=>!d.excluded) ?? []);setPets(registered);setReferences(refs);}
  },[item.id]);
  useEffect(()=>{
    alive.current=true;
    const update=()=>void refresh().catch(()=>{if(alive.current)setError('반려동물 인식 결과를 불러오지 못했습니다.');});
    update();window.addEventListener('gamjassak-pet-results',update);
    return()=>{alive.current=false;window.removeEventListener('gamjassak-pet-results',update);};
  },[refresh]);
  if(!rows.length && !error)return null;
  return <section className="petPhotoResults"><h3>반려동물</h3>{error && <p role="alert">{error}</p>}
    {!review ? <><p>{rows.map(row=>row.pet_id ? pets.find(p=>p.id===row.pet_id)?.name ?? '미확인' : row.view==='rear' ? '뒷모습 · 확인 필요' : '반려동물 확인 필요').join(' · ')}</p><button onClick={()=>setReview(true)}>인식 결과 확인·수정</button></> : <>{rows.map(row=><DetectionCard key={`${row.id}:${row.pet_id}:${row.view}`} detection={row} item={item} pets={pets} references={references} onSaved={refresh}/>)}<button onClick={()=>setReview(false)}>접기</button></>}
  </section>;
}
