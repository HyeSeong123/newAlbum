import {useEffect,useRef,useState} from 'react';
import {convertFileSrc,invoke} from '@tauri-apps/api/core';
import type {MediaItem} from '../../types/media';
import {normalizeLocalFilePath} from '../media/mediaSource';
import {measurePetRuntime} from './engine/deviceBenchmark';
export function PetDeviceBenchmarkPanel({photos,disabled=false}:{photos:MediaItem[];disabled?:boolean}) {
  const [media,setMedia]=useState(photos[0]?.id??''),[done,setDone]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [report,setReport]=useState<Awaited<ReturnType<typeof measurePetRuntime>>|null>(null);
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
  async function measure() {
    if(active.current || disabled || !media)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setDone(0);setReport(null);setMessage('');
    try {
      const jobs=await invoke<{pending:number}>('list_pet_jobs');
      if(jobs?.pending)throw new Error('진행 중인 사진 분석을 먼저 마치거나 중단해 주세요.');
      const input=await invoke<{path:string}>('prepare_pet_input',{id:Number(media)});
      controller.signal.throwIfAborted();
      const result=await measurePetRuntime(convertFileSrc(normalizeLocalFilePath(input.path)),controller.signal,n=>{if(mounted.current)setDone(n);});
      if(mounted.current)setReport(result);
    }catch(error){if(mounted.current)setMessage(controller.signal.aborted?'측정을 중단했습니다.':String(error instanceof Error?error.message:error));}
    finally{active.current=null;if(mounted.current)setBusy(false);}
  }
  return <section className="petEvaluationPanel" aria-label="이 기기 처리 속도 측정">
    <strong>이 기기 처리 속도 측정</strong>
    <p>선택 사진을 4번 분석합니다. 첫 실행은 따로 표시하고 나머지 3회의 중앙값을 비교합니다. 사진 연결과 인식 기준은 바뀌지 않습니다.</p>
    <label>속도 측정 사진<select aria-label="속도 측정 사진" disabled={busy||disabled} value={media} onChange={e=>setMedia(e.target.value)}>{photos.map(p=><option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>
    <div className="peopleActions"><button disabled={busy||disabled||!media} onClick={()=>void measure()}>이 기기에서 측정</button>{busy && <button onClick={()=>active.current?.abort()}>측정 중단</button>}</div>
    <p role="status">{busy?`처리 속도 측정 ${done}/4`:message}</p>
    {report && <div className="petEvaluationReport" role="status"><strong>추론 중앙값 {(report.medianInferenceMs/1000).toFixed(2)}초</strong><p>사진 읽기·대기 포함 {(report.medianPhotoMs/1000).toFixed(2)}초 · 첫 측정 {(report.first.wallMs/1000).toFixed(2)}초 · {report.backends.join(', ')}{report.simd?' / SIMD':''}</p><small>현재 기기의 선택 사진 1장에 대한 측정입니다. 첫 측정에 기존 모델이 메모리에 남아 있을 수 있습니다. 전체 앱 최대 메모리·발열·배터리·개체 식별 정확도는 별도 실사용 확인이 필요합니다.</small></div>}
  </section>;
}
