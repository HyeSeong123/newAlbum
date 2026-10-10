import {analyzePersonImage} from './client';
import type {FaceBackend,FaceDiagnostics,FaceFeatures} from './types';
export async function measurePersonRuntime(url:string,signal:AbortSignal,onProgress:(done:number)=>void){
 const samples:{backend:FaceBackend;wallMs:number;diagnostics:FaceDiagnostics;faces:number}[]=[];
 let cpu:FaceFeatures[]=[];let maxBackendDistance:number|null=null;
 // A scheduler slot must own all model disposal. Never terminate a Worker
 // from outside runAI while an unrelated scan may hold that slot.
 for(const backend of ['cpu','wasm'] as const){
  for(let i=0;i<4;i++){
   signal.throwIfAborted();let diagnostics:FaceDiagnostics|undefined;const started=performance.now();
   const faces=await analyzePersonImage(url,signal,backend,value=>{diagnostics=value;});
   if(!diagnostics)throw new Error('처리 시간 측정값을 받지 못했습니다.');
   if(backend==='cpu'&&i===0)cpu=faces;
   if(backend==='wasm'&&i===0&&cpu.length===faces.length&&faces.length){maxBackendDistance=Math.max(...faces.map((face,j)=>Math.sqrt(face.descriptor.reduce((sum,x,k)=>sum+(x-cpu[j].descriptor[k])**2,0))));}
   samples.push({backend,wallMs:performance.now()-started,diagnostics,faces:faces.length});onProgress(samples.length);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 const median=(v:number[])=>[...v].sort((a,b)=>a-b)[1];
 const summarize=(backend:FaceBackend)=>{const rows=samples.filter(s=>s.backend===backend),warm=rows.slice(1);return {firstMs:rows[0].wallMs,medianInferenceMs:median(warm.map(r=>r.diagnostics.elapsedMs)),medianPhotoMs:median(warm.map(r=>r.wallMs)),tensors:warm.map(r=>r.diagnostics.tensors),tensorBytes:warm.map(r=>r.diagnostics.tensorBytes),simd:warm.every(r=>r.diagnostics.simd)};};
 return {cpu:summarize('cpu'),wasm:summarize('wasm'),samples,maxBackendDistance,userAgent:navigator.userAgent,identityAccuracyMeasured:false,wholeAppPeakMemoryMeasured:false,heatOrBatteryMeasured:false};
}
