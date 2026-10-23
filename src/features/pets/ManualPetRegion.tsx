import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { FunctionHelp } from '../../components/FunctionHelp';
import { MediaVisual } from '../../components/MediaVisual';
import type { MediaItem } from '../../types/media';
import { addManualPetRegion } from './engine/manager';
import { VIEW_LABELS, type PetFeatures, type PetKind, type PetView } from './engine/types';

export function ManualPetRegion({item,onClose,onSaved}:{item:MediaItem;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [box,setBox]=useState<PetFeatures['box']>([.1,.1,.8,.8]);
 const [kind,setKind]=useState<PetKind>('dog'),[view,setView]=useState<PetView>('unknown');
 const [ratio,setRatio]=useState(item.width&&item.height?item.width/item.height:1);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const anchor=useRef<[number,number]|null>(null),abort=useRef<AbortController|null>(null),lock=useRef(false),saved=useRef(false);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const point=(event:React.PointerEvent<HTMLDivElement>):[number,number]=>{const r=event.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];};
 async function save(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');abort.current=new AbortController();
  try {if(!saved.current){await addManualPetRegion(item,box,kind,view,abort.current.signal);saved.current=true;}window.dispatchEvent(new Event('gamjassak-pet-results'));await onSaved();onClose();}
  catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  finally{lock.current=false;abort.current=null;setBusy(false);}
 }
 return <EntityEditorDialog title="반려동물 직접 추가" busy={busy} onClose={onClose} className="manualPetRegion">
  <div className="entityEditBody">
   <FunctionHelp title="반려동물 영역 지정"><p>사진에서 한 마리의 몸 전체를 드래그해 감싸세요. 얼굴 영역은 추가한 뒤 인식 결과 수정에서 지정할 수 있습니다.</p><p>선택한 영역의 특징만 추출합니다. 이름 연결은 다음 화면에서 직접 확인합니다.</p></FunctionHelp>
   <div className="petDetectionPreview manualPetCanvas" role="group" aria-label="반려동물 영역 지정" style={{aspectRatio:ratio,touchAction:'none'}} onLoadCapture={event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.naturalHeight)setRatio(image.naturalWidth/image.naturalHeight);}}
    onPointerDown={event=>{if(busy)return;anchor.current=point(event);event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(!anchor.current||busy)return;const end=point(event),start=anchor.current;setBox([Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])]);}}
    onPointerUp={()=>{anchor.current=null;}} onPointerCancel={()=>{anchor.current=null;}}>
    <MediaVisual item={item}/><span className="petDetectionBox" style={{left:`${box[0]*100}%`,top:`${box[1]*100}%`,width:`${box[2]*100}%`,height:`${box[3]*100}%`}}/>
   </div>
   <details className="petRegionCoordinates"><summary>영역 크기 조정</summary><div>{['가로 위치','세로 위치','너비','높이'].map((label,index)=><label key={label}>{label} (%)<input type="number" min={0} max={100} step={1} value={Math.round(box[index]*100)} disabled={busy} onChange={event=>setBox(current=>{const next=[...current] as PetFeatures['box'];next[index]=Math.max(0,Math.min(100,Number(event.target.value)))/100;return next;})}/></label>)}</div></details>
   <label className="entityEditField">반려동물 종류<select aria-label="반려동물 종류" value={kind} disabled={busy} onChange={event=>setKind(event.target.value as PetKind)}><option value="dog">강아지</option><option value="cat">고양이</option></select></label>
   <label className="entityEditField">촬영 방향<select aria-label="촬영 방향" value={view} disabled={busy} onChange={event=>setView(event.target.value as PetView)}>{Object.entries(VIEW_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   {error&&<p role="alert">{error}</p>}{busy&&<button onClick={()=>abort.current?.abort()}>영역 분석 중단</button>}
  </div>
  <footer className="peopleActions entityEditFooter"><button disabled={busy} onClick={onClose}>취소</button><button className="primaryControl" disabled={busy||box[2]<=0||box[3]<=0||box[0]+box[2]>1.000001||box[1]+box[3]>1.000001} onClick={()=>void save()}>{busy&&<LoaderCircle size={18} className="spinIcon"/>}영역 추가</button></footer>
 </EntityEditorDialog>;
}
