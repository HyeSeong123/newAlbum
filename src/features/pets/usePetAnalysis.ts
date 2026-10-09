import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';
import { isTauriRuntime, loadRegisteredMedia } from '../../services/tauriMediaService';
import type { PetView } from './engine/types';
import type { PetProgress } from './engine/manager';
interface Job { id:number;media_id:number;pet_id:number|null;view:PetView;state:'pending'|'paused'|'failed';error:string }
interface Queue {jobs:Job[];pending:number;paused:number;failed:number}
export function usePetAnalysis() {
  const controller=useRef<AbortController|null>(null), mounted=useRef(true);
  const operations=useRef<Promise<unknown>>(Promise.resolve());
  const settled=useRef<Promise<void>>(Promise.resolve()), rerun=useRef(false);
  const [progress,setProgress]=useState<PetProgress|null>(null), [waiting,setWaiting]=useState(0);
  const report=useCallback((error:unknown)=>{if(mounted.current)setProgress({done:0,total:0,failed:1,detected:0,running:false,message:error instanceof Error?error.message:String(error)});},[]);
  const pump=useCallback(async():Promise<void>=>{
    if(!isTauriRuntime() || !mounted.current)return;
    if(controller.current){rerun.current=true;return;}
    const abort=new AbortController();controller.current=abort;
    let release!:()=>void;settled.current=new Promise<void>(resolve=>{release=resolve;});
    let done=0,failed=0,detected=0;
    try {
      const {scanPetBatch}=await import('./engine/manager');
      let items=new Map((await loadRegisteredMedia()).map(item=>[Number(item.id),item]));
      for(;;){
        abort.signal.throwIfAborted();
        const queue=await invoke<Queue>('list_pet_jobs');
        if(!queue?.jobs)break; // browser previews without native queue commands
        if(mounted.current)setWaiting(queue.paused+queue.failed);
        const job=queue.jobs.find(job=>job.state==='pending');
        if(!job){if(mounted.current && (done || queue.paused || queue.failed))setProgress({done,total:done,failed,detected,running:false,message:queue.paused+queue.failed?`완료 ${done}장 · 대기 ${queue.paused}장 · 재시도 필요 ${queue.failed}장${queue.jobs.find(j=>j.error)?.error?` (${queue.jobs.find(j=>j.error)!.error})`:''}`:`반려동물 확인 필요 ${detected}마리 · ${done}장 확인`});break;}
        let item=items.get(job.media_id);
        if(!item){items=new Map((await loadRegisteredMedia()).map(item=>[Number(item.id),item]));item=items.get(job.media_id);}
        if(!item){await invoke('finish_pet_job',{id:job.id,error:null});continue;}
        let outcome:PetProgress|undefined;
        await scanPetBatch([item],abort.signal,value=>{
          outcome=value;
          if(mounted.current)setProgress({...value,done,total:done+queue.pending,failed,detected,running:true});
        },job.pet_id!==null?{petId:job.pet_id,views:{[item.id]:job.view}}:undefined);
        abort.signal.throwIfAborted();
        const problem=outcome?.failed ? outcome.message : null;
        await invoke('finish_pet_job',{id:job.id,error:problem});
        done++;failed+=outcome?.failed??0;detected+=outcome?.detected??0;
      }
    }catch(error){if(!abort.signal.aborted)report(error);}
    finally{if(controller.current===abort)controller.current=null;release();if(rerun.current && mounted.current && !abort.signal.aborted){rerun.current=false;void pump();}}
  },[report]);
  const schedule=useCallback((operation:()=>Promise<void>)=>{
    operations.current=operations.current.catch(()=>undefined).then(operation).then(()=>{void pump();}).catch(report);
  },[pump,report]);
  const start=useCallback((items:MediaItem[],petId?:number,views:Record<string,PetView>={})=>{
    if(!isTauriRuntime())return;
    const photos=items.filter(item=>item.fileType==='image');
    schedule(async()=>{for(let index=0;index<photos.length;index+=1000)await invoke('enqueue_pet_jobs',{jobs:photos.slice(index,index+1000).map(item=>({mediaId:Number(item.id),petId:petId??null,view:views[item.id]??'unknown'}))});});
  },[schedule]);
  useEffect(()=>{
    mounted.current=true;
    const imported=(event:Event)=>start((event as CustomEvent<MediaItem[]>).detail);
    const enrolled=(event:Event)=>{const {items,petId,views}=(event as CustomEvent).detail;start(items,petId,views);};
    window.addEventListener('gamjassak-pet-import',imported);window.addEventListener('gamjassak-pet-enroll',enrolled);
    schedule(async()=>{});
    return()=>{mounted.current=false;controller.current?.abort();void settled.current.then(()=>{if(mounted.current)void pump();});window.removeEventListener('gamjassak-pet-import',imported);window.removeEventListener('gamjassak-pet-enroll',enrolled);};
  },[start,schedule]);
  return {progress,waiting,cancel:()=>{controller.current?.abort();const finished=settled.current;schedule(async()=>{await invoke('control_pet_jobs',{resume:false});await finished;});},resume:()=>schedule(async()=>{await settled.current;await invoke('control_pet_jobs',{resume:true});}),dismiss:()=>setProgress(null)};
}
