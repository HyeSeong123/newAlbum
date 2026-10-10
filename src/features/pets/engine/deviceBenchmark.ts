import { analyzePetImage,type PetDiagnostics } from './client';
// Read-only: no enrollments, photo links, saved detections or model changes.
export async function measurePetRuntime(url:string,signal:AbortSignal,onProgress:(done:number)=>void) {
  const rows:{wallMs:number;diagnostics:PetDiagnostics}[]=[];
  for(let i=0;i<4;i++) {
    signal.throwIfAborted();let diagnostics:PetDiagnostics|undefined;
    const started=performance.now();
    await analyzePetImage(url,signal,'unknown',undefined,'auto',value=>{diagnostics=value;});
    if(!diagnostics)throw new Error('처리 시간 측정값을 받지 못했습니다.');
    rows.push({wallMs:performance.now()-started,diagnostics});onProgress(i+1);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const warm=rows.slice(1),median=(values:number[])=>[...values].sort((a,b)=>a-b)[1];
  return {runs:3,first:rows[0],medianInferenceMs:median(warm.map(r=>r.diagnostics.elapsedMs)),medianPhotoMs:median(warm.map(r=>r.wallMs)),backends:[...new Set(warm.map(r=>r.diagnostics.backend))],simd:warm.every(r=>r.diagnostics.simd),tensorCounts:warm.map(r=>r.diagnostics.tensors),tensorBytes:warm.map(r=>r.diagnostics.tensorBytes),measurements:rows,userAgent:navigator.userAgent,identityAccuracyMeasured:false,wholeAppPeakMemoryMeasured:false,heatOrBatteryMeasured:false};
}
