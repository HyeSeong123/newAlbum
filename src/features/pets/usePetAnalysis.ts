import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';
import { isTauriRuntime, loadRegisteredMedia } from '../../services/tauriMediaService';
import type { PetView } from './engine/types';
import type { PetProgress } from './engine/manager';
import { petAnalysisError } from './analysisError';
interface Job { id:number;media_id:number;pet_id:number|null;view:PetView;state:'pending'|'paused'|'failed';error:string;refresh?:boolean }
interface Queue {jobs:Job[];pending:number;paused:number;failed:number}
type AnalysisCounts = { done:number; failed:number; detected:number; retrained:number; learned:number; missed:number };
export type PetAnalysis = ReturnType<typeof usePetAnalysis>;
export function usePetAnalysis(media: MediaItem[]) {
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const controller=useRef<AbortController|null>(null), mounted=useRef(true);
  const operations=useRef<Promise<unknown>>(Promise.resolve());
  const settled=useRef<Promise<void>>(Promise.resolve()), rerun=useRef(false);
  const relearning=useRef(false);
  const continuation=useRef<AnalysisCounts|null>(null), resumeRequested=useRef(false);
  const [progress,setProgress]=useState<PetProgress|null>(null), [waiting,setWaiting]=useState(0);
  const report=useCallback((error:unknown)=>{if(mounted.current)setProgress({done:0,total:0,failed:1,detected:0,running:false,message:petAnalysisError(error)});},[]);
  const pump=useCallback(async():Promise<void>=>{
    if(!isTauriRuntime() || !mounted.current)return;
    if(controller.current){rerun.current=true;return;}
    const abort=new AbortController();controller.current=abort;
    let release!:()=>void;settled.current=new Promise<void>(resolve=>{release=resolve;});
    let {done,failed,detected,retrained,learned,missed}=resumeRequested.current && continuation.current
      ? continuation.current : {done:0,failed:0,detected:0,retrained:0,learned:0,missed:0};
    resumeRequested.current=false;
    try {
      const {scanPetBatch}=await import('./engine/manager');
      let items=new Map((mediaRef.current.length ? mediaRef.current : await loadRegisteredMedia()).map(item=>[Number(item.id),item]));
      for(;;){
        abort.signal.throwIfAborted();
        const queue=await invoke<Queue>('list_pet_jobs');
        if(!queue?.jobs)break; // browser previews without native queue commands
        if(mounted.current)setWaiting(queue.paused+queue.failed);
        const pending = queue.jobs.filter(job => job.state === 'pending');
        if(!pending.length){if(mounted.current && (done || queue.paused || queue.failed || relearning.current))setProgress({done,total:done,failed,detected,running:false,message:queue.paused+queue.failed?`완료 ${done}장 · 대기 ${queue.paused}장 · 분석하지 못한 사진 ${queue.failed}장${queue.jobs.find(j=>j.error)?.error?`\n${petAnalysisError(queue.jobs.find(j=>j.error)!.error)}`:''}`:retrained || relearning.current?`등록 사진 ${retrained}장 다시 분석 완료 · 인식 기준 ${learned}개 갱신${missed?` · 찾지 못함 ${missed}장 (사진 연결 유지)`:''} · 확인 필요 ${detected}마리`:`반려동물 확인 필요 ${detected}마리 · ${done}장 확인`});relearning.current=false;break;}
        let processedInBatch = 0;
        for (const job of pending) {
        abort.signal.throwIfAborted();
        let item=items.get(job.media_id);
        if(!item){items=new Map((mediaRef.current.some(item=>Number(item.id)===job.media_id) ? mediaRef.current : await loadRegisteredMedia()).map(item=>[Number(item.id),item]));item=items.get(job.media_id);}
        if(!item){await invoke('finish_pet_job',{id:job.id,error:null});continue;}
        let outcome:PetProgress|undefined;
        await scanPetBatch([item],abort.signal,value=>{
          outcome=value;
          if(mounted.current)setProgress({...value,message:job.refresh?`인식 기준 갱신 중 · ${item.fileName}`:value.message,done,total:done+queue.pending-processedInBatch,failed,detected,running:true});
        },job.pet_id!==null?{petId:job.pet_id,views:job.view==='unknown'?{}:{[item.id]:job.view}}:undefined,!!job.refresh);
        abort.signal.throwIfAborted();
        const problem=outcome?.failed ? outcome.message : null;
        await invoke('finish_pet_job',{id:job.id,error:problem});
        done++;processedInBatch++;failed+=outcome?.failed??0;detected+=outcome?.detected??0;if(job.refresh && !problem){retrained++;learned+=outcome?.learned??0;missed+=outcome?.missed??0;}
        }
      }
    }catch(error){if(!abort.signal.aborted)report(error);}
    finally{continuation.current=abort.signal.aborted?{done,failed,detected,retrained,learned,missed}:null;if(controller.current===abort)controller.current=null;release();if(rerun.current && mounted.current && !abort.signal.aborted){rerun.current=false;void pump();}}
  },[report]);
  const schedule=useCallback((operation:()=>Promise<void>, run=true)=>{
    operations.current=operations.current.catch(()=>undefined).then(operation).then(()=>{if(run)void pump();}).catch(report);
  },[pump,report]);
  const start=useCallback((items:MediaItem[],petId?:number,views:Record<string,PetView>={})=>{
    if(!isTauriRuntime())return;
    const photos=items.filter(item=>item.fileType==='image');
    if(!photos.length)return;
    if(!controller.current)setProgress({done:0,total:photos.length,failed:0,detected:0,running:true,message:'반려동물 분석을 준비하고 있어요.'});
    schedule(async()=>{for(let index=0;index<photos.length;index+=1000)await invoke('enqueue_pet_jobs',{jobs:photos.slice(index,index+1000).map(item=>({mediaId:Number(item.id),petId:petId??null,view:views[item.id]??'unknown'}))});});
  },[schedule,report]);
  const refreshReferences=useCallback((groups:{petId:number;items:MediaItem[]}[])=>{
    if(!isTauriRuntime())return;
    relearning.current=true;
    controller.current?.abort();
    const finished=settled.current;
    setProgress({done:0,total:groups.reduce((sum,group)=>sum+group.items.length,0),failed:0,detected:0,running:true,message:'인식 기준 갱신 준비 중'});
    schedule(async()=>{
      await finished;
      for(const group of groups){const photos=group.items.filter(item=>item.fileType==='image');for(let index=0;index<photos.length;index+=1000)await invoke('enqueue_pet_jobs',{jobs:photos.slice(index,index+1000).map(item=>({mediaId:Number(item.id),petId:group.petId,view:'unknown',refresh:true}))});}
    });
  },[schedule,report]);
  useEffect(()=>{
    mounted.current=true;
    // Startup only reads the durable queue. Imports and profile saves never
    // authorize inference, including pending work left by an older version.
    if(isTauriRuntime()) schedule(async()=>{
      const queue=await invoke<Queue>('list_pet_jobs');
      const count=(queue?.pending??0)+(queue?.paused??0)+(queue?.failed??0);
      if(mounted.current && count){setWaiting(count);setProgress({done:0,total:count,failed:0,detected:0,running:false,message:`이전 분석 ${count}장이 대기 중이에요. 원할 때 이어서 분석하세요.`});}
    },false);
    return()=>{mounted.current=false;rerun.current=false;controller.current?.abort();};
  },[schedule]);
  return {progress,waiting,start,refreshReferences,cancel:()=>{
    rerun.current=false;controller.current?.abort();const finished=settled.current;
    schedule(async()=>{
      await finished;await invoke('control_pet_jobs',{resume:false});
      const queue=await invoke<Queue>('list_pet_jobs');
      if(mounted.current){setWaiting((queue?.paused??0)+(queue?.failed??0));setProgress(previous=>previous?{...previous,running:false,message:'분석을 멈췄어요. 완료한 결과는 저장되어 있어요.'}:null);}
    },false);
  },resume:()=>{schedule(async()=>{await settled.current;await invoke('control_pet_jobs',{resume:true});resumeRequested.current=true;});},dismiss:()=>setProgress(null)};
}

