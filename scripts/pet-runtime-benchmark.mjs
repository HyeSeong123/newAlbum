import assert from 'node:assert/strict';

// A single known frontal fixture checks APK integration, not accuracy.
export async function verifyInstalledCatFace(page, base64) {
  const result=await page.evaluate(async encoded=>{
    const entry=document.querySelector('script[type="module"][src]');
    const bundle=await (await fetch(entry.src)).text();
    const workerName=bundle.match(/pet\.worker-[\w-]+\.js/)?.[0];
    if(!workerName)throw new Error('Production pet Worker was not found');
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const source=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    const crop=document.createElement('canvas');crop.width=285;crop.height=300;crop.getContext('2d').drawImage(source,230,40,285,300,0,0,285,300);source.close();
    const bitmap=await createImageBitmap(await new Promise(resolve=>crop.toBlob(resolve,'image/jpeg',.95)));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const worker=new Worker(new URL(`/assets/${workerName}`,location.href),{type:'module'});let id=0;
    const run=regions=>new Promise((resolve,reject)=>{
      const requestId=++id,pixels=rgba.slice().buffer;
      const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);};
      const message=event=>{if(event.data.id!==requestId)return;cleanup();event.data.error?reject(new Error(event.data.error)):resolve(event.data);};
      const error=()=>{cleanup();reject(new Error('Cat Worker failed'));};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Cat Worker timed out'));},120000);
      worker.addEventListener('message',message);worker.addEventListener('error',error);
      worker.postMessage({id:requestId,width:canvas.width,height:canvas.height,pixels,modelBase:new URL('/models/pets/',location.href).href,viewHint:'unknown',regions,backend:'auto'},[pixels]);
    });
    try {
      const front=await run(),cat=front.features[0];
      if(!cat)throw new Error('Frontal cat fixture was missed');
      const rear=await run([{...cat,view:'rear',viewSource:'user'}]);
      return {kind:cat.kind,view:cat.view,viewSource:cat.viewSource,faceBox:cat.faceBox,faceLength:cat.faceAppearance?.length,backend:front.diagnostics.backend,rearClearsIdentity:rear.features.every(f=>!f.appearance.length&&!f.mirroredAppearance.length&&!f.faceAppearance.length&&!f.faceBox),diagnostics:front.diagnostics};
    }finally{worker.terminate();}
  },base64);
  assert.equal(result.kind,'cat');assert.equal(result.view,'front');assert.equal(result.viewSource,'cat-frontal-cascade');assert.equal(result.faceLength,1024);assert.equal(result.faceBox.length,4);assert.equal(result.rearClearsIdentity,true);assert.equal(result.backend,'wasm');
  return result;
}

// Execute the installed production Worker, without a test-only app API.
export async function benchmarkInstalledPetRuntime(page, inputPath) {
  const result = await page.evaluate(async path => {
    const entry = document.querySelector('script[type="module"][src]');
    if (!entry) throw new Error('Production entry was not found');
    const bundle = await (await fetch(entry.src)).text();
    const workerName = bundle.match(/pet\.worker-[\w-]+\.js/)?.[0];
    if (!workerName) throw new Error('Production pet Worker was not found');
    let bitmap = await createImageBitmap(await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(path,'asset'))).blob());
    if (Math.max(bitmap.width,bitmap.height)>640) {
      const scale=640/Math.max(bitmap.width,bitmap.height);
      const resized=await createImageBitmap(bitmap,{resizeWidth:Math.max(1,Math.round(bitmap.width*scale)),resizeHeight:Math.max(1,Math.round(bitmap.height*scale))});
      bitmap.close();bitmap=resized;
    }
    const canvas = document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context = canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);bitmap.close();
    const rgba = context.getImageData(0,0,canvas.width,canvas.height).data;
    const worker = new Worker(new URL(`/assets/${workerName}`,location.href),{type:'module'});
    let id=0;
    const run = backend => new Promise((resolve,reject)=>{
      const requestId=++id,pixels=rgba.slice().buffer;
      const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);};
      const message=event=>{if(event.data.id!==requestId)return;cleanup();event.data.error?reject(new Error(event.data.error)):resolve(event.data);};
      const error=()=>{cleanup();reject(new Error('Benchmark Worker failed'));};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Benchmark timed out'));},120000);
      worker.addEventListener('message',message);worker.addEventListener('error',error);
      worker.postMessage({id:requestId,width:canvas.width,height:canvas.height,pixels,modelBase:new URL('/models/pets/',location.href).href,viewHint:'unknown',backend},[pixels]);
    });
    const rows={cpu:[],wasm:[]},cold={},features={};
    try {
      for(const backend of ['cpu','auto']){
        const key=backend==='auto'?'wasm':'cpu';
        cold[key]=(await run(backend)).diagnostics;
        for(let i=0;i<3;i++){const result=await run(backend);rows[key].push(result.diagnostics);features[key]=result.features;}
      }
      const summarize=values=>({runs:values.length,medianMs:values.map(v=>v.elapsedMs).sort((a,b)=>a-b)[1],minMs:Math.min(...values.map(v=>v.elapsedMs)),maxMs:Math.max(...values.map(v=>v.elapsedMs)),tensorCounts:values.map(v=>v.tensors),tensorBytes:values.map(v=>v.tensorBytes),backends:values.map(v=>v.backend)});
      const cosine=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)/Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
      const cpu=features.cpu[0],wasm=features.wasm[0];
      return {sample:'existing-dog-fixture',photos:1,runsPerBackend:3,cold,cpu:summarize(rows.cpu),wasm:summarize(rows.wasm),poseModels:features.wasm.map(f=>({version:f.automaticPose?.modelVersion,keypoints:f.automaticPose?.keypoints?.length,view:f.automaticPose?.view})),cpuKinds:features.cpu.map(f=>f.kind),wasmKinds:features.wasm.map(f=>f.kind),bodyCosine:cpu&&wasm?cosine(cpu.appearance,wasm.appearance):null,mirrorCosine:cpu&&wasm?cosine(cpu.mirroredAppearance,wasm.mirroredAppearance):null,maxBoxDifference:cpu&&wasm?Math.max(...cpu.box.map((v,i)=>Math.abs(v-wasm.box[i]))):null,diagnostics:rows,identityAccuracyMeasured:false,wholeAppPeakMemoryMeasured:false};
    }finally{worker.terminate();}
  },inputPath);
  assert.deepEqual(result.cpuKinds,result.wasmKinds);
  assert.ok(result.cpuKinds.includes('dog'));
  assert.ok(result.poseModels.length>0 && result.poseModels.every(p=>p.version==='quadpose-ap10k-52f0329b-v1' && p.keypoints===17));
  assert.deepEqual(result.wasm.backends,['wasm','wasm','wasm']);
  assert.ok(result.bodyCosine>.9999 && result.mirrorCosine>.9999);
  assert.ok(result.maxBoxDifference<.001);
  assert.equal(new Set(result.cpu.tensorCounts).size,1);
  assert.equal(new Set(result.wasm.tensorCounts).size,1);
  return result;
}
