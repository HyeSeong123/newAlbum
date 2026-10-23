import { FunctionHelp } from '../../components/FunctionHelp';
import { useEffect, useState } from 'react';
import type { MediaItem } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import { EntitySelectionBar } from '../entities/EntitySelectionBar';
import { EntityAssignmentDialog } from '../entities/EntityAssignmentDialog';
import { assignPetDetections } from '../entities/entityService';
import { invoke } from '@tauri-apps/api/core';
interface UnknownPetItem {id:number;media_id:number;box_:number[]|null}
import type { Pet } from './petService';
import { useRowSelection } from '../../hooks/useRowSelection';
import { Check } from 'lucide-react';

export function UnknownPets({ photos, pets, onSaved, selecting, onOpen }: { selecting: boolean; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; photos: MediaItem[]; pets: Pet[]; onSaved: () => Promise<void> }) {
  const [ratios,setRatios]=useState<Record<string,number>>({});
  const [rows,setRows]=useState<UnknownPetItem[]>([]), [page,setPage]=useState(0), [next,setNext]=useState(false);
  const [selection,setSelection]=useState<number[]>([]), [assigning,setAssigning]=useState(false);
  useEffect(()=>{if(!selecting)setSelection([]);},[selecting]);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState(''), [loading,setLoading]=useState(true);

  async function read(currentPage:number) {
    const batch=await invoke<UnknownPetItem[]>('list_unknown_pet_items',{page:currentPage});
    const byId=new Set(photos.map(photo=>Number(photo.id)));
    return {found:batch.slice(0,24).filter(row=>byId.has(row.media_id)),more:batch.length>24};
  }
  useEffect(()=>{
    let alive=true,request=0;
    const refresh=()=>{
      const current=++request;setLoading(true);setError('');
      read(page).then(result=>{if(alive&&current===request){setRows(result.found);setNext(result.more);}}).catch(reason=>{if(alive&&current===request)setError(String(reason));}).finally(()=>{if(alive&&current===request)setLoading(false);});
    };
    refresh();window.addEventListener('gamjassak-pet-results',refresh);
    return()=>{alive=false;window.removeEventListener('gamjassak-pet-results',refresh);};
  },[page,photos]);
  const toggle=(id:string)=>setSelection(current=>current.includes(Number(id))?current.filter(value=>value!==Number(id)):[...current,Number(id)]);
  const drag=useRowSelection(selecting && !loading,toggle,id=>selection.includes(Number(id)));
  return <section aria-label="미확인 반려동물">
    {!selecting && <FunctionHelp title="미확인 반려동물"><p>테두리가 있으면 인식한 반려동물만, 미확인 사진이면 사진 연결에 이름을 지정합니다. 같은 사진의 다른 반려동물은 유지됩니다.</p></FunctionHelp>}
    {loading && <p role="status">미확인 반려동물 불러오는 중…</p>}
    {error && <p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!loading && !rows.length && !error && <p>미확인 반려동물이 없습니다. ‘반려동물 사진 찾기’에서 분석을 시작할 수 있어요.</p>}
    <div className="petGrid" {...drag}>{rows.map(row=>{
      const item=photos.find(photo=>Number(photo.id)===row.media_id)!;
      return <button key={row.id} className="petPhoto" data-selection-id={row.id} aria-label={selecting?`반려동물 선택 ${row.id}`:`반려동물 사진 상세보기 ${row.id}`} aria-pressed={selecting?selection.includes(row.id):undefined} onClick={()=>{if(selecting)toggle(String(row.id));else onOpen(item,photos);}}><div className="petDetectionPreview" style={{aspectRatio:ratios[item.id]??(item.width && item.height?item.width/item.height:1)}} onLoadCapture={event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.naturalHeight){const ratio=image.naturalWidth/image.naturalHeight;setRatios(current=>current[item.id]===ratio?current:{...current,[item.id]:ratio});}}}><MediaVisual item={item}/>{row.box_ && <span className="petDetectionBox" style={{left:`${row.box_[0]*100}%`,top:`${row.box_[1]*100}%`,width:`${row.box_[2]*100}%`,height:`${row.box_[3]*100}%`}}/>}</div>{selecting && <span className={`faceCheck ${selection.includes(row.id)?'checked':''}`} aria-hidden="true">{selection.includes(row.id) && <Check size={22}/>}</span>}<span>{row.id<0?'미확인 사진':'미확인 반려동물'}</span></button>;
    })}</div>
    {(page>0 || next) && <div className="peopleActions"><button disabled={loading || !page} onClick={()=>setPage(page-1)}>이전</button><span>{page+1}</span><button disabled={loading || !next} onClick={()=>setPage(page+1)}>다음</button></div>}
    {selecting && <EntitySelectionBar count={selection.length} unit="반려동물 인식 결과" help={<><p>테두리가 있으면 인식한 반려동물만, 미확인 사진이면 사진 연결에 이름을 지정합니다. 같은 사진의 다른 반려동물은 유지됩니다.</p><p>전체 선택은 현재 불러온 페이지에 적용됩니다.</p></>} allLabel="현재 페이지 전체 선택" busy={loading} onAll={()=>setSelection(current=>[...new Set([...current,...rows.map(row=>row.id)])])} onClear={()=>setSelection([])} onClose={()=>{setSelection([]);window.dispatchEvent(new Event('gamjassak-unknown-pet-selection-close'));}}><button className="primaryControl" disabled={!selection.length} onClick={()=>setAssigning(true)}>이름 지정</button></EntitySelectionBar>}
    {assigning && <EntityAssignmentDialog kind="pet" entries={pets} count={selection.length} unit="반려동물 인식 결과" onClose={()=>setAssigning(false)} onSave={async value=>{
      await assignPetDetections(selection,value);setNotice(`${value.name??pets.find(pet=>pet.id===value.target)?.name??'반려동물'}에 인식 결과 ${selection.length}개를 연결했습니다.`);setSelection([]);
      try {await onSaved();const result=await read(0);setRows(result.found);setNext(result.more);setPage(0);}
      catch {setRows(current=>current.filter(row=>!selection.includes(row.id)));setError('저장은 완료했지만 목록을 갱신하지 못했습니다. 미확인 반려동물을 다시 열어 주세요.');}
      window.dispatchEvent(new Event('gamjassak-pet-results'));
    }}/>}
  </section>;
}
