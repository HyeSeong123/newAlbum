import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { MediaVisual } from '../../components/MediaVisual';
import type { MediaItem } from '../../types/media';
import { loadPets, savePet, type Pet } from './petService';
import { confirmPetDetection, getPetScan, loadPetReferences, scanPetPhoto, extractPetCorrection, savePetCorrection } from './engine/manager';
import { recognizePet, withView } from './engine/matcher';
import { VIEW_LABELS, type PetDetection, type PetReference, type PetView, type PetFeatures, type PetKind } from './engine/types';
import './pets.css';

function DetectionCard({ detection, item, pets, references, preferredPet, onSaved }: {
  detection: PetDetection; item: MediaItem; pets: Pet[]; references: PetReference[]; preferredPet?: Pet; onSaved: () => Promise<void>;
}) {
  const [view, setView] = useState<PetView>(detection.view);
  const [kind,setKind]=useState<PetKind>(detection.kind), [faceBox,setFaceBox]=useState<PetFeatures['faceBox']>(detection.faceBox);
  const [selectFace,setSelectFace]=useState(false);
  const anchor=useRef<[number,number]|null>(null), inference=useRef<AbortController|null>(null);
  useEffect(()=>()=>inference.current?.abort(),[]);
  const [chosen, setChosen] = useState(detection.pet_id !== null ? String(detection.pet_id) : preferredPet?.media_ids.includes(detection.media_id) ? String(preferredPet.id) : '');
  const [name, setName] = useState('');
  const [imageRatio,setImageRatio]=useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [prepared,setPrepared]=useState<{selection:string;features:PetFeatures}|null>(null);
  const locked = useRef(false);
  const selection=JSON.stringify([view,kind,faceBox]);
  const preview=prepared?.selection===selection?prepared.features:undefined;
  const faceChanged=JSON.stringify(faceBox)!==JSON.stringify(detection.faceBox);
  const query=preview??{...detection,kind,...(faceChanged?{faceBox:undefined,faceAppearance:[],mirroredFaceAppearance:[]}:{})};
  const result = recognizePet(withView(query,view), references.filter(reference => reference.features !== detection && (reference.features as PetDetection).id !== detection.id));
  const [x,y,w,h] = detection.box;
  async function compareFace(){
    if(locked.current)return;
    locked.current=true;setBusy(true);setError('');inference.current=new AbortController();
    try{
      const features=await extractPetCorrection(item,detection,view,kind,faceBox,inference.current.signal,view==='rear');
      if(view!=='rear' && !features.faceAppearance?.length)throw new Error('비교할 얼굴 영역을 지정해 주세요.');
      setPrepared({selection,features});setSelectFace(false);
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{inference.current=null;locked.current=false;setBusy(false);}
  }
  async function save(excluded = false) {
    if (locked.current) return;
    if (!excluded && chosen === 'new' && !name.trim()) {setError('새 반려동물의 이름을 입력해 주세요.');return;}
    locked.current = true; setBusy(true);setError('');
    try {
      let features:PetFeatures|undefined=excluded?undefined:preview;
      if (!excluded && !features && (kind!==detection.kind || faceChanged || (view!=='rear' && view!=='unknown' && !detection.appearance.length))) {
        // Extract first, then create/link a pet; a failed crop must not leave a
        // newly registered empty pet or silently discard existing confirmations.
        inference.current=new AbortController();
        features=await extractPetCorrection(item,detection,view,kind,faceBox,inference.current.signal);
      }
      const id = excluded ? null : chosen === 'new' ? await savePet(null,name.trim(),[],null) : chosen ? Number(chosen) : null;
      if(features)await savePetCorrection(detection.id,id,features);
      else await confirmPetDetection(detection.id,id,view,excluded);
      window.dispatchEvent(new Event('gamjassak-pet-results'));
      await onSaved();
    } catch (reason) {setError(typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '확인 내용을 저장하지 못했습니다.');}
    finally {inference.current=null;locked.current = false;setBusy(false);}
  }
  const point=(event:React.PointerEvent<HTMLDivElement>):[number,number]=>{const r=event.currentTarget.getBoundingClientRect();return [Math.max(x,Math.min(x+w,(event.clientX-r.left)/r.width)),Math.max(y,Math.min(y+h,(event.clientY-r.top)/r.height))];};
  const state = detection.excluded ? '탐지 제외 · 변경 가능' : detection.pet_id !== null ? '연결 완료 · 변경 가능' : view === 'rear' ? '뒷모습 분석 · 확인 필요' : result.candidates.length ? '반려동물 확인 필요' : '미등록 후보 · 직접 확인';
  return <article className="petDetectionCard">
    <div className={`petDetectionPreview ${selectFace?'selectFace':''}`} style={{aspectRatio:imageRatio}} onPointerDown={event=>{if(!selectFace||busy)return;anchor.current=point(event);event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!selectFace||busy||!anchor.current)return;const end=point(event),start=anchor.current;setFaceBox([Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])]);}} onPointerUp={()=>{anchor.current=null;}} onPointerCancel={()=>{anchor.current=null;}} onLoadCapture={event=>{const image=event.target;if(image instanceof HTMLImageElement && image.naturalHeight)setImageRatio(image.naturalWidth/image.naturalHeight);}}><MediaVisual item={item} fit="cover" /><span className="petDetectionBox" style={{left:`${x*100}%`,top:`${y*100}%`,width:`${w*100}%`,height:`${h*100}%`}} />
      {faceBox && view!=='rear' && view!=='unknown' && <span className="petFaceBox" style={{left:`${faceBox[0]*100}%`,top:`${faceBox[1]*100}%`,width:`${faceBox[2]*100}%`,height:`${faceBox[3]*100}%`}}/>}
      <span className="petDetectionTag">{kind === 'dog' ? '강아지' : '고양이'}</span></div>
    <div className="petDetectionFields">
      <strong>{state}</strong>
      <small>{item.fileName}</small>
      {detection.viewSource==='cat-frontal-cascade' && <p className="petMatchNotice">고양이 정면 얼굴을 자동으로 찾았습니다. 얼굴 테두리와 촬영 방향을 확인하고, 다르면 수정해 주세요.</p>}
      {detection.viewSource==='quadpose-keypoints' && <p className="petMatchNotice">촬영 방향을 자동으로 추정했습니다. 사진과 다르면 방향을 수정해 주세요.</p>}
      <label>종류<select aria-label="반려동물 종류" disabled={busy} value={kind} onChange={event=>setKind(event.target.value as PetKind)}><option value="dog">강아지</option><option value="cat">고양이</option></select></label>
      <label>촬영 방향<select aria-label="촬영 방향" disabled={busy} value={view} onChange={event => {const next=event.target.value as PetView;setView(next);if(next==='rear'||next==='unknown'){setFaceBox(undefined);setSelectFace(false);}}}>{Object.entries(VIEW_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {view!=='rear' && view!=='unknown' && <div className="petFaceControls"><button disabled={busy} aria-pressed={selectFace} onClick={()=>setSelectFace(!selectFace)}>{selectFace?'얼굴 지정 마침':'얼굴 영역 지정'}</button>{faceBox && <><button disabled={busy} onClick={()=>void compareFace()}>선택한 얼굴로 후보 비교</button><button disabled={busy} onClick={()=>{setFaceBox(undefined);setSelectFace(false);}}>얼굴 영역 해제</button></>}<small>{selectFace?'동물 테두리 안에서 얼굴을 둘러싸도록 드래그해 주세요.':'얼굴을 지정한 사진끼리는 얼굴 특징을 우선 비교합니다.'}</small></div>}
      {view==='rear' && <button disabled={busy} onClick={()=>void compareFace()}>뒷모습 체형·색상 다시 비교</button>}
      {preview && <p role="status">{view==='rear'?'체형·색상 후보를 다시 비교했습니다.':'얼굴 특징으로 후보를 다시 비교했습니다.'} 반려동물을 선택한 뒤 저장해 주세요.</p>}
      {view==='rear' && <small>{query.foreground?'배경으로 추정한 영역을 제외한 체형·색상을 비교합니다.':'배경과 털색을 분리하기 어려워 사진 영역 전체의 체형·색상을 비교합니다.'}</small>}
      <p className="petMatchNotice">{view === 'rear' ? '체형·색상 유사 후보만 비교합니다. 같은 반려동물인지 직접 확인해 주세요.' : view === 'unknown' ? '방향을 확인하지 못했습니다. 사진에서 방향과 반려동물을 직접 선택해 주세요.' : '외형 특징을 비교한 후보입니다. 같은 반려동물인지 직접 확인해 주세요.'}</p>
      {result.candidates.length > 0 && <p className="petMatchNotice">유사 후보: {result.candidates.map(candidate => `${pets.find(pet => pet.id===candidate.petId)?.name ?? '삭제된 등록'} (${candidate.basis === 'shape-color' ? '체형·색상' : candidate.basis==='face-appearance'?'얼굴·외형':'외형'})`).join(', ')}</p>}
      <label>반려동물<select aria-label="인식된 반려동물" disabled={busy} value={chosen} onChange={event => setChosen(event.target.value)}><option value="">미확인 / 연결 해제</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}<option value="new">반려동물 추가</option></select></label>
      {chosen === 'new' && <label>새 반려동물 이름<input aria-label="새 반려동물 이름" disabled={busy} maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label>}
      <div className="peopleActions"><button disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="spinIcon" /> : null}변경 저장</button><button disabled={busy} onClick={() => void save(true)}>반려동물 아님</button></div>
      {busy && inference.current && <button onClick={()=>inference.current?.abort()}>얼굴 분석 중단</button>}
      {error && <p role="alert">{error}</p>}
    </div>
  </article>;
}

export function PetPhotoResults({ item }: { item: MediaItem }) {
  const [rows,setRows]=useState<PetDetection[]>([]), [pets,setPets]=useState<Pet[]>([]), [references,setReferences]=useState<PetReference[]>([]);
  const [review,setReview]=useState(false), [error,setError]=useState('');
  const [busy,setBusy]=useState(false), abort=useRef<AbortController|null>(null);
  const alive=useRef(true);
  const refresh=useCallback(async()=>{
    const [scan,registered,refs]=await Promise.all([getPetScan(Number(item.id)),loadPets(),loadPetReferences()]);
    if(alive.current){setRows(scan?.detections ?? []);setPets(registered);setReferences(refs);}
  },[item.id]);
  useEffect(()=>{
    alive.current=true;
    const update=()=>void refresh().catch(()=>{if(alive.current)setError('반려동물 인식 결과를 불러오지 못했습니다.');});
    update();window.addEventListener('gamjassak-pet-results',update);
    return()=>{alive.current=false;abort.current?.abort();window.removeEventListener('gamjassak-pet-results',update);};
  },[refresh]);
  async function reanalyze(){if(abort.current)return;abort.current=new AbortController();setBusy(true);setError('');try{await scanPetPhoto(item,abort.current.signal,'unknown',true,true);window.dispatchEvent(new Event('gamjassak-pet-results'));await refresh();}catch(reason){if(alive.current)setError(String(reason instanceof Error?reason.message:reason));}finally{abort.current=null;if(alive.current)setBusy(false);}}
  return <section className="petPhotoResults"><h3>반려동물</h3>{error && <p role="alert">{error}</p>}
    {!review ? <><p>{rows.filter(d=>!d.excluded).map(row=>row.pet_id ? pets.find(p=>p.id===row.pet_id)?.name ?? '미확인' : row.view==='rear' ? '뒷모습 · 확인 필요' : '반려동물 확인 필요').join(' · ') || '아직 확인한 반려동물이 없습니다.'}</p>{rows.length>0 && <button disabled={busy} onClick={()=>setReview(true)}>인식 결과 확인·수정</button>}</> : <>{rows.map(row=><DetectionCard key={`${row.id}:${row.pet_id}:${row.view}:${row.kind}:${row.faceBox}`} detection={row} item={item} pets={pets} references={references} onSaved={refresh}/>)}<button onClick={()=>setReview(false)}>접기</button></>}
    <button disabled={busy} onClick={()=>void reanalyze()}>{busy?'반려동물 분석 중…':'연결 유지하고 재분석'}</button>{busy && <button onClick={()=>abort.current?.abort()}>분석 중단</button>}
    <p className="petMatchNotice">사진 내용이 바뀐 경우 기존 사진 연결은 유지하고, 동물별 확인 내용과 특징은 새 분석으로 교체합니다.</p>
  </section>;
}
