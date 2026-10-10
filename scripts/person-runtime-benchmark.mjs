import assert from 'node:assert/strict';
// This fixture is supplied from the existing FaceAPI package, never user data.
export async function verifyInstalledPersonRuntime(page,base64,mediaId){
 const result=await page.evaluate(async({encoded,mediaId})=>{
  const entry=document.querySelector('script[type="module"][src]');
  const bundle=await(await fetch(entry.src)).text();const name=bundle.match(/person\.worker-[\w-]+\.js/)?.[0];
  if(!name)throw new Error('Production person Worker missing');
  const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/jpeg'}));
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  let worker=new Worker(new URL(`/assets/${name}`,location.href),{type:'module'}),id=0;
  const run=backend=>new Promise((resolve,reject)=>{
   const request=++id,pixels=rgba.slice().buffer;
   const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);};
   const message=event=>{if(event.data.id!==request)return;cleanup();event.data.error?reject(new Error(event.data.error)):resolve(event.data);};
   const error=()=>{cleanup();reject(new Error('Person Worker failed'));};const timer=setTimeout(error,120000);
   worker.addEventListener('message',message);worker.addEventListener('error',error);
   worker.postMessage({id:request,width:canvas.width,height:canvas.height,pixels,backend,modelBase:new URL('/models/faces/',location.href).href},[pixels]);
  });
  try {
   const cpu=await run('cpu'),wasm=await run('wasm'),warm=await run('auto');
   const drift=wasm.faces.map((f,i)=>Math.sqrt(f.descriptor.reduce((sum,x,j)=>sum+(x-cpu.faces[i].descriptor[j])**2,0)));
   const native=window.__TAURI_INTERNALS__;
   await native.invoke('enqueue_person_jobs',{mediaIds:[mediaId]});await native.invoke('control_person_jobs',{resume:false});await native.invoke('control_person_jobs',{resume:true});
   const source=await native.invoke('get_person_scan_source',{mediaId});
   // A dog fixture has no face labels; save an empty functional result only.
   await native.invoke('save_face_scan',{mediaId,faces:[],sourceKey:source.source_key});await native.invoke('finish_person_job',{mediaId,failed:false});
   const duplicate=await native.invoke('get_person_scan_source',{mediaId});
   return {faces:cpu.faces.length,valid:cpu.faces.every(f=>f.descriptor.length===128&&f.descriptor.every(Number.isFinite)),maxBackendDistance:Math.max(...drift),cpu:cpu.diagnostics,wasm:wasm.diagnostics,auto:warm.diagnostics,nativeSourceVerified:source.source_key.startsWith('sha256:'),completedCache:duplicate.completed,offline:true,identityAccuracyMeasured:false,devicePerformanceMeasured:false};
  }finally{worker.terminate();}
 },{encoded:base64,mediaId});
 assert.equal(result.faces,3);assert.equal(result.valid,true);assert.ok(result.maxBackendDistance<.001);assert.equal(result.wasm.backend,'wasm');assert.equal(result.auto.backend,'wasm');assert.equal(result.nativeSourceVerified,true);assert.equal(result.completedCache,true);
 return result;
}
