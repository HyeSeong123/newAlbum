import { useEffect,useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type { MediaItem } from '../../types/media';
import type { Pet } from './petService';
import { getPetScan } from './engine/manager';
import { VIEW_LABELS,type PetDetection,type PetView } from './engine/types';
export function PetEvaluationPanel({photos,pets}:{photos:MediaItem[];pets:Pet[]}){
 const [media,setMedia]=useState(photos[0]?.id??''),[rows,setRows]=useState<PetDetection[]>([]),[detection,setDetection]=useState('');
 const [role,setRole]=useState('query'),[pet,setPet]=useState(''),[view,setView]=useState<PetView>('front'),[kind,setKind]=useState('dog');
 const [group,setGroup]=useState(''),[rights,setRights]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [counts,setCounts]=useState({references:0,queries:0});
 const refresh=async()=>{const result=await invoke<typeof counts>('pet_evaluation_summary');if(result)setCounts(result);};
 useEffect(()=>{let alive=true;setRows([]);setDetection('');void getPetScan(Number(media)).then(scan=>{if(alive)setRows(scan?.detections.filter(d=>!d.excluded)??[]);}).catch(()=>{if(alive)setMessage('사진을 먼저 분석해 주세요.');});return()=>{alive=false;};},[media]);
 useEffect(()=>{void refresh().catch(()=>setMessage('검증 자료를 불러오지 못했습니다.'));},[]);
 async function add(){if(busy)return;setBusy(true);setMessage('');try{await invoke('save_pet_evaluation',{sample:{mediaId:Number(media),detectionId:detection?Number(detection):null,petId:pet?Number(pet):null,role,captureGroup:group,view,kind,rights}});await refresh();setMessage('검증 자료에 추가했습니다. 사진 연결과 인식 기준은 변경하지 않았습니다.');}catch(error){setMessage(String(error instanceof Error?error.message:error));}finally{setBusy(false);}}
 async function download(){if(busy)return;setBusy(true);setMessage('');try{const destination=await save({title:'반려동물 검증 자료 저장',defaultPath:'gamjassak-pet-evaluation.json',filters:[{name:'검증 특징 자료',extensions:['json']}]});if(destination){await invoke('export_pet_evaluation',{destination});setMessage('검증 자료를 저장했습니다. 원본 사진은 포함하지 않습니다.');}}catch(error){setMessage(String(error instanceof Error?error.message:error));}finally{setBusy(false);}}
 return <section className="petEvaluationPanel" aria-label="반려동물 검증 자료">
  <strong>인식 성능 검증 자료</strong><p className="petMatchNotice">등록 기준과 평가 사진은 서로 다른 촬영 세션으로 구분해 주세요. 평가 정답은 후보를 보기 전 실제 반려동물을 기준으로 입력합니다. 동일 사진·같은 연속 촬영은 양쪽에 사용하지 않습니다.</p>
  <label>검증 사진<select aria-label="검증 사진" disabled={busy} value={media} onChange={e=>setMedia(e.target.value)}>{photos.map(p=><option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>
  <label>평가 대상<select aria-label="평가 대상" disabled={busy} value={detection} onChange={e=>setDetection(e.target.value)}><option value="">탐지 실패 — 사진에 동물이 있지만 놓침</option>{rows.map(row=><option key={row.id} value={row.id}>{row.kind==='dog'?'강아지':'고양이'} · 영역 {row.id}</option>)}</select></label>
  <label>자료 용도<select aria-label="자료 용도" disabled={busy} value={role} onChange={e=>setRole(e.target.value)}><option value="query">평가 사진</option><option value="reference">등록 기준 사진</option></select></label>
  <label>실제 반려동물<select aria-label="실제 반려동물" disabled={busy} value={pet} onChange={e=>setPet(e.target.value)}><option value="">미등록 개체</option>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>실제 촬영 방향<select aria-label="실제 촬영 방향" disabled={busy} value={view} onChange={e=>setView(e.target.value as PetView)}>{Object.entries(VIEW_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>실제 동물 종류<select aria-label="실제 동물 종류" disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="dog">강아지</option><option value="cat">고양이</option></select></label>
  <label>촬영 세션 이름<input aria-label="촬영 세션 이름" disabled={busy} value={group} maxLength={160} placeholder="예: 10월 10일 오전 산책" onChange={e=>setGroup(e.target.value)}/></label>
  <label>사진 사용 권리·출처<input aria-label="사진 사용 권리·출처" disabled={busy} value={rights} maxLength={500} placeholder="예: 직접 촬영 / 촬영자 사용 허락" onChange={e=>setRights(e.target.value)}/></label>
  <div className="peopleActions"><button disabled={busy || !media || !group.trim() || !rights.trim() || role==='reference'&&(!detection||!pet)} onClick={()=>void add()}>검증 자료에 추가</button><button disabled={busy || !counts.references&&!counts.queries} onClick={()=>void download()}>검증 자료 JSON 저장</button></div>
  <p role="status">등록 기준 {counts.references}장 · 평가 {counts.queries}장{message?` · ${message}`:''}</p>
 </section>;
}
