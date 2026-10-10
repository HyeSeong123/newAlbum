import {useEffect,useRef,useState} from 'react';
import {convertFileSrc,invoke} from '@tauri-apps/api/core';
import type {MediaItem} from '../../types/media';
import {normalizeLocalFilePath} from '../media/mediaSource';
import {measurePersonRuntime} from './engine/deviceBenchmark';
type Environment={os:string;architecture:string;version:string};
export function PersonDeviceBenchmarkPanel({photos,disabled,onBusy}:{photos:MediaItem[];disabled:boolean;onBusy:(value:boolean)=>void}){
 const [media,setMedia]=useState(photos[0]?.id??''),[busy,setBusy]=useState(false),[done,setDone]=useState(0),[message,setMessage]=useState('');
 const [report,setReport]=useState<(Awaited<ReturnType<typeof measurePersonRuntime>>&{environment:Environment})|null>(null);
 const active=useRef<AbortController|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();};},[]);
 async function measure(){
  if(disabled||active.current||!media)return;
  const controller=new AbortController();active.current=controller;setBusy(true);onBusy(true);setDone(0);setReport(null);setMessage('');
  try{
   const photo=photos.find(p=>p.id===media);if(!photo)throw new Error('측정 사진을 선택해 주세요.');
   const source=await invoke<{source_key:string}>('get_person_scan_source',{mediaId:Number(media)}),environment=await invoke<Environment>('person_runtime_environment');
   const result=await measurePersonRuntime(convertFileSrc(normalizeLocalFilePath(photo.filePath)),controller.signal,n=>{if(alive.current)setDone(n);});
   const after=await invoke<{source_key:string}>('get_person_scan_source',{mediaId:Number(media)});controller.signal.throwIfAborted();
   if(after.source_key!==source.source_key)throw new Error('측정 중 사진이 변경됐습니다. 결과를 저장하지 않았습니다.');
   if(alive.current)setReport({...result,environment});
  }catch(e){if(alive.current)setMessage(controller.signal.aborted?'인물 측정을 중단했습니다.':e instanceof Error?e.message:String(e));}
  finally{active.current=null;if(alive.current)setBusy(false);onBusy(false);}
 }
 return <section className="personValidationPanel" aria-label="이 기기 인물 처리 속도"><h3>이 기기 인물 처리 속도</h3><p>선택 사진을 CPU와 WASM으로 각각 4번 분석합니다. 첫 실행과 이후 3회의 중앙값을 분리하며 사진·인물 연결을 저장하지 않습니다.</p>
  <label>인물 속도 측정 사진<select aria-label="인물 속도 측정 사진" value={media} disabled={busy||disabled} onChange={e=>setMedia(e.target.value)}>{photos.map(p=><option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>
  <div className="peopleActions"><button disabled={busy||disabled||!media} onClick={()=>void measure()}>이 기기 인물 속도 측정</button>{busy&&<button onClick={()=>active.current?.abort()}>인물 측정 중단</button>}</div><p role="status">{busy?`인물 처리 속도 측정 ${done}/8`:message}</p>
  {report&&<div role="status"><p>{report.environment.os} · {report.environment.architecture} · 앱 {report.environment.version}</p><p>CPU 추론 중앙값 {(report.cpu.medianInferenceMs/1000).toFixed(2)}초 · WASM {(report.wasm.medianInferenceMs/1000).toFixed(2)}초{report.wasm.simd?' / SIMD':''}</p><p>사진 읽기·대기 포함 CPU {(report.cpu.medianPhotoMs/1000).toFixed(2)}초 · WASM {(report.wasm.medianPhotoMs/1000).toFixed(2)}초</p><p>첫 실행 CPU {(report.cpu.firstMs/1000).toFixed(2)}초 · WASM {(report.wasm.firstMs/1000).toFixed(2)}초</p><p>CPU/WASM 특징 거리 {report.maxBackendDistance===null?'비교 불가':report.maxBackendDistance.toExponential(2)} · 모델 텐서 최대 {(Math.max(...report.cpu.tensorBytes,...report.wasm.tensorBytes)/1e6).toFixed(1)} MB</p><small>현재 환경의 사진 1장에 한정됩니다. 첫 실행에 모델이 메모리에 남아 있을 수 있으며 전체 앱 최대 메모리·발열·배터리·대량 등록 안정성·식별 정확도는 별도 확인이 필요합니다. WASM 미지원 시 측정을 실패로 표시합니다.</small></div>}
 </section>;
}
