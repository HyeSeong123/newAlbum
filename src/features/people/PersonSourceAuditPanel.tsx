import {useEffect,useRef,useState} from 'react';
import type {MediaItem} from '../../types/media';
import {auditPersonSources,type SourceAuditItem} from './engine/sourceAudit';
const labels:Record<SourceAuditItem['state'],string>={verified:'원본 일치',legacy:'이전 기록·변경 여부 확인 불가',source_changed:'원본 변경',model_changed:'다른 모델',unavailable:'원본 읽기 실패'};
export function PersonSourceAuditPanel({photos,disabled,onBusy}:{photos:MediaItem[];disabled:boolean;onBusy:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[counts,setCounts]=useState<Record<string,number>>({}),[issues,setIssues]=useState<SourceAuditItem[]>([]);
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>{controller.current?.abort();onBusy(false);},[onBusy]);
 async function run(){
  if(disabled||controller.current)return;
  const abort=new AbortController();controller.current=abort;setBusy(true);onBusy(true);setCounts({});setIssues([]);setStatus('분석한 사진 원본을 점검하는 중');
  try{await auditPersonSources(abort.signal,false,items=>{setCounts(previous=>{const next={...previous};for(const item of items)next[item.state]=(next[item.state]??0)+1;return next;});setIssues(previous=>[...previous,...items.filter(item=>!['verified','legacy'].includes(item.state))].slice(0,50));});setStatus('원본 점검 완료. 변경·읽기 실패·다른 모델의 특징은 얼굴 비교에서 제외했습니다.');}
  catch{setStatus(abort.signal.aborted?'원본 점검을 중단했습니다. 아직 점검하지 않은 사진은 결과에 포함되지 않습니다.':'원본 점검을 완료하지 못했습니다. 다시 시도해 주세요.');}
  finally{controller.current=null;setBusy(false);onBusy(false);}
 }
 return <section className="personValidationPanel" aria-label="얼굴 원본 변경 점검"><h3>분석한 사진 원본 점검</h3><p>기존 인물 연결과 원본은 유지됩니다. 문제가 확인된 특징은 비교에서 제외하며 자동 재추출하지 않습니다. 이전 기록에 원본 해시가 없으면 변경 여부를 확인할 수 없습니다.</p><div className="peopleActions"><button disabled={disabled||busy} onClick={()=>void run()}>얼굴 원본 점검</button>{busy&&<button onClick={()=>controller.current?.abort()}>원본 점검 중단</button>}</div><p role="status">{status}</p>{Object.entries(counts).map(([state,count])=><p key={state}>{labels[state as SourceAuditItem['state']]}: {count}장</p>)}{issues.length>0&&<ul>{issues.map(item=><li key={item.mediaId}>{photos.find(photo=>Number(photo.id)===item.mediaId)?.fileName??`사진 ${item.mediaId}`} · {labels[item.state]}</li>)}</ul>}<p>문제 사진 목록은 최대 50장 표시됩니다. 중단 요청은 현재 최대 20장 묶음 점검이 끝난 뒤 적용됩니다.</p></section>;
}
