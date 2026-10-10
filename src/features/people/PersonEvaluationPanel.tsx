import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {MediaItem} from '../../types/media';
import type {FaceIndex} from './faceService';
import {MediaVisual} from '../../components/MediaVisual';

const categories={front:'정면',expression:'다른 표정',left:'좌측 측면',right:'우측 측면',lookalikes:'비슷한 다른 인물',group:'여러 사람',small:'작은 얼굴',glasses:'안경',dark:'어두운 조명',occluded:'일부 가림',unregistered:'미등록 인물','person-pet':'사람과 반려동물'};
type Metrics={top1Known:number|null;falseLinkPerLabeledFace:number|null;falseLinkPerAutoLink:number|null;unknownFalseAccept:number|null;autoLinks:number};
type Condition={samples:number;detectionRecall:number|null;featureCompatibilityRate:number|null;baseline:Metrics;improved:Metrics};
type Report={photos:number;labeledFaces:number;referenceFaces:number;referencePeople:number;conditions:Record<string,Condition>};
const percent=(n:number|null)=>n===null?'미측정':`${(n*100).toFixed(1)}%`;
export function PersonEvaluationPanel({photos,index,disabled,onBusy}:{photos:MediaItem[];index:FaceIndex;disabled:boolean;onBusy:(value:boolean)=>void}){
 const [media,setMedia]=useState(photos[0]?.id??''),[face,setFace]=useState(''),[person,setPerson]=useState(''),[role,setRole]=useState('query');
 const [session,setSession]=useState(''),[rights,setRights]=useState(''),[category,setCategory]=useState('front'),[slot,setSlot]=useState(1);
 const [counts,setCounts]=useState({references:0,queries:0}),[report,setReport]=useState<Report|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),lock=useRef(false);
 const selected=photos.find(p=>p.id===media),faces=index.faces.filter(f=>f.media_id===Number(media));
 useEffect(()=>{alive.current=true;void invoke<typeof counts>('person_evaluation_summary').then(v=>{if(alive.current&&v)setCounts(v);}).catch(()=>{if(alive.current)setMessage('평가 자료를 불러오지 못했습니다.');});return()=>{alive.current=false;};},[]);
 useEffect(()=>{setFace('');},[media]);
 async function action(kind:'save'|'evaluate'|'clear'){
  if(disabled||lock.current)return;lock.current=true;setBusy(true);onBusy(true);setMessage('');setReport(null);
  try{
   if(kind==='save')await invoke('save_person_evaluation',{sample:{mediaId:Number(media),faceId:face?Number(face):null,personId:person?Number(person):null,missedSlot:slot,role,captureGroup:session,category,rights}});
   if(kind==='clear')await invoke('clear_person_evaluation');
   if(kind==='evaluate'){const next=await invoke<Report>('evaluate_person_samples');if(alive.current)setReport(next);}
   else {const next=await invoke<typeof counts>('person_evaluation_summary');if(alive.current){setCounts(next);setMessage(kind==='save'?'평가 정답을 저장했습니다. 기존 인물 연결은 유지했습니다.':'평가 자료만 삭제했습니다.');}}
  }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:String(e));}
  finally{lock.current=false;if(alive.current)setBusy(false);onBusy(false);}
 }
 const blocked=busy||disabled;
 return <section className="personValidationPanel" aria-label="인물 정확도 평가"><h3>인물 정확도 평가</h3>
  <p>후보를 보기 전 실제 사람을 정답으로 입력해 주세요. 등록 기준과 평가는 다른 사진·다른 촬영 세션을 사용합니다. 원본 사진과 인물 연결은 바뀌지 않습니다.</p>
  <label>평가 사진<select aria-label="평가 사진" value={media} disabled={blocked} onChange={e=>setMedia(e.target.value)}>{photos.map(p=><option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>
  {selected&&<MediaVisual item={selected} className="personEvaluationPhoto"/>}
  <fieldset disabled={blocked}><legend>사진 속 평가 대상 얼굴</legend><label><input type="radio" name="evaluationFace" checked={!face} onChange={()=>setFace('')}/>탐지 실패 — 실제 얼굴이 있지만 놓침</label><div className="personEvaluationFaces">{faces.map((f,i)=><label key={f.id}><input type="radio" name="evaluationFace" aria-label={`평가 얼굴 ${i+1}`} checked={face===String(f.id)} onChange={()=>setFace(String(f.id))}/><img src={f.thumbnail} alt={`평가 얼굴 ${i+1}`}/>얼굴 {i+1}</label>)}</div></fieldset>
  {!face&&<label>미탐지 얼굴 번호<input aria-label="미탐지 얼굴 번호" type="number" min={1} max={100} value={slot} disabled={blocked} onChange={e=>setSlot(Number(e.target.value))}/></label>}
  <label>인물 자료 용도<select aria-label="인물 자료 용도" value={role} disabled={blocked} onChange={e=>setRole(e.target.value)}><option value="query">평가 사진</option><option value="reference">등록 기준 사진</option></select></label>
  <label>실제 인물<select aria-label="실제 인물" value={person} disabled={blocked} onChange={e=>setPerson(e.target.value)}><option value="">미등록 인물</option>{index.people.filter(p=>p.name.trim()).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>인물 평가 조건<select aria-label="인물 평가 조건" value={category} disabled={blocked} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>인물 촬영 세션<input aria-label="인물 촬영 세션" maxLength={160} value={session} disabled={blocked} placeholder="예: 10월 10일 오전 산책" onChange={e=>setSession(e.target.value)}/></label>
  <label>인물 사진 사용 권리·출처<input aria-label="인물 사진 사용 권리·출처" maxLength={500} value={rights} disabled={blocked} placeholder="예: 직접 촬영·피촬영자 평가 사용 동의" onChange={e=>setRights(e.target.value)}/></label>
  <div className="peopleActions"><button disabled={blocked||!media||!session.trim()||!rights.trim()||role==='reference'&&(!face||!person)||!Number.isInteger(slot)||slot<1||slot>100} onClick={()=>void action('save')}>인물 평가 자료에 추가</button><button disabled={blocked||!counts.references||!counts.queries} onClick={()=>void action('evaluate')}>인물 평가 결과 확인</button><button disabled={blocked||!counts.references&&!counts.queries} onClick={()=>{if(window.confirm('인물 평가 정답만 삭제할까요? 사진과 인물 연결은 유지됩니다.'))void action('clear');}}>인물 평가 자료 삭제</button></div>
  <p role="status">등록 기준 {counts.references}개 · 평가 {counts.queries}개{busy?' · 평가 작업 중':message?` · ${message}`:''}</p>
  {report&&<div className="personEvaluationReport" role="status"><p>평가 사진 {report.photos}장 · 정답 얼굴 {report.labeledFaces}개 · 등록 기준 {report.referencePeople}명/{report.referenceFaces}개</p><div className="personEvaluationTable"><table><caption>기존 거리 비교와 확인 기준 비교 — 입력한 정답 자료에 한정</caption><thead><tr><th>조건</th><th>정답 수</th><th>탐지율</th><th>기존 Top-1</th><th>확인 기준 Top-1</th><th>오연결/전체</th><th>미등록 오수락</th></tr></thead><tbody>{Object.entries({all:'전체',...categories}).map(([key,label])=>{const c=report.conditions[key];return c&&<tr key={key}><th>{label}</th><td>{c.samples}</td><td>{percent(c.detectionRecall)}</td><td>{percent(c.baseline.top1Known)}</td><td>{percent(c.improved.top1Known)}</td><td>{percent(c.improved.falseLinkPerLabeledFace)}</td><td>{percent(c.improved.unknownFalseAccept)}</td></tr>;})}</tbody></table></div><small>없는 조건은 미측정입니다. 촬영 세션의 독립성과 정답은 사용자가 확인해야 합니다. 저장된 특징의 비교 정책 평가이며 기존·개선 탐지기의 별도 비교 실험은 아닙니다. 얼굴이 없는 뒷모습은 동일 인물 정답으로 평가하지 않습니다.</small></div>}
 </section>;
}
