import { expect, test } from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('Worker detects dog locally and keeps main thread responsive with cancel/retry', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Actual model inference runs once; the review UI is tested on both viewports.');
  test.setTimeout(240000);
  await page.route('**/pet-test.jpg', route => route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.route('**/pet-cat.jpg', route => route.fulfill({path:'tests/fixtures/pet-cat-front.jpg',contentType:'image/jpeg'}));
  await page.route('**/pet-close-cat.jpg',route=>route.fulfill({path:'tests/fixtures/pet-cat.jpg',contentType:'image/jpeg'}));
  await page.route('**/pet-hard-cat.jpg', route => route.fulfill({path:'tests/fixtures/pet-cat.jpg',contentType:'image/jpeg'}));
  await page.route('**/pet-negative.jpg', route => route.fulfill({path:'node_modules/@vladmandic/face-api/demo/sample1.jpg',contentType:'image/jpeg'}));
  await page.goto('/');
  const external:string[]=[];
  page.on('request',r=>{if(!['localhost','127.0.0.1'].includes(new URL(r.url()).hostname))external.push(r.url());});
  const result=await page.evaluate(async()=>{
    const clientPath='/src/features/pets/engine/client.ts',matcherPath='/src/features/pets/engine/matcher.ts';
    const {analyzePetImage}=await import(/* @vite-ignore */ clientPath);
    const {comparePets,recognizePet}=await import(/* @vite-ignore */ matcherPath);
    let ticks=0;const interval=setInterval(()=>ticks++,20);const started=performance.now();
    const cancel=new AbortController();const stopped=analyzePetImage('/pet-test.jpg',cancel.signal);setTimeout(()=>cancel.abort(),100);
    let aborted=false;try{await stopped;}catch(e){aborted=(e as Error).name==='AbortError';}
    const features=await analyzePetImage('/pet-test.jpg');const negative=await analyzePetImage('/pet-negative.jpg');const cats=await analyzePetImage('/pet-cat.jpg');const hardCats=await analyzePetImage('/pet-hard-cat.jpg');const bitmap=await createImageBitmap(await (await fetch('/pet-close-cat.jpg')).blob());
    const crop=document.createElement('canvas');crop.width=285;crop.height=300;crop.getContext('2d')!.drawImage(bitmap,230,40,285,300,0,0,285,300);bitmap.close();
    const cropUrl=URL.createObjectURL(await new Promise<Blob>(resolve=>crop.toBlob(blob=>resolve(blob!),'image/jpeg',.95)));
    let closeCats;try{closeCats=await analyzePetImage(cropUrl);}finally{URL.revokeObjectURL(cropUrl);}
    const object=features[0], [x,y,w,h]=object.box;
    if(object.automaticPose?.keypoints?.length!==17 || object.automaticPose.modelVersion!=='quadpose-ap10k-52f0329b-v1')throw new Error('Bundled animal pose model did not execute');
    const front=await analyzePetImage('/pet-test.jpg',undefined,'front',[{...object,view:'front',faceBox:[x+w*0.2,y+h*0.2,w*0.3,h*0.3]}]);
    const rear=await analyzePetImage('/pet-test.jpg',undefined,'rear',[{...front[0],view:'rear'}]);
    if(front[0].faceAppearance.length!==1024 || rear[0].appearance.length || rear[0].faceAppearance.length || rear[0].faceBox)throw new Error('face/rear extraction policy failed');
    clearInterval(interval);
    return {catFace:closeCats[0]?.faceBox,catView:closeCats[0]?.view,catViewSource:closeCats[0]?.viewSource,catFaceLength:closeCats[0]?.faceAppearance?.length,hardCatCount:hardCats.length,hardCatAutomaticLinks:hardCats.filter((f:any)=>recognizePet(f,[]).autoPetId!==null).length,catCount:cats.length,catKind:cats[0]?.kind,catLength:cats[0]?.appearance.length,aborted,count:features.length,negative:negative.length,kind:features[0]?.kind,view:features[0]?.view,length:features[0]?.appearance.length,color:features[0]?.color.length,shape:features[0]?.shape.length,score:comparePets(features[0],features[0]).score,auto:recognizePet(features[0],[{petId:1,features:features[0]}]).autoPetId,ticks,elapsedMs:performance.now()-started};
  });
  await mkdir('preview-results',{recursive:true});await writeFile('preview-results/pet-worker-smoke.json',JSON.stringify(result,null,2));
  console.log('Pet Worker smoke (NOT identity accuracy):',JSON.stringify(result));
  expect(result.catView).toBe('front');expect(result.catViewSource).toBe('cat-frontal-cascade');expect(result.catFaceLength).toBe(1024);expect(result.catFace).toHaveLength(4);expect(result.hardCatAutomaticLinks).toBe(0);expect(result.aborted).toBe(true);expect(result.count).toBeGreaterThan(0);expect(result.kind).toBe('dog');expect(['front','left','right','unknown']).toContain(result.view);expect(result.length).toBe(1024);expect(result.color).toBe(120);expect(result.shape).toBe(10);expect(result.score).toBeCloseTo(1,4);expect(result.auto).toBeNull();expect(result.negative).toBe(0);expect(result.catCount).toBeGreaterThan(0);expect(result.catKind).toBe('cat');expect(result.catLength).toBe(1024);expect(result.ticks).toBeGreaterThan(10);expect(external).toEqual([]);
});

test('offline WASM matches CPU outputs, reuses corrected body vectors and has bounded tensor counts',async({page,isMobile})=>{
  test.skip(isMobile,'Runtime comparison runs once; installed Android is measured separately.');
  test.setTimeout(240000);
  await page.route('**/pet-runtime.jpg',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.goto('/');
  const external:string[]=[];
  page.on('request',request=>{if(!['localhost','127.0.0.1'].includes(new URL(request.url()).hostname))external.push(request.url());});
  const result=await page.evaluate(async()=>{
    const path='/src/features/pets/engine/client.ts';
    const {analyzePetImage,cancelPetInference}=await import(/* @vite-ignore */ path);
    const diagnostics:any[]=[];
    const listener=(event:Event)=>diagnostics.push((event as CustomEvent).detail);
    window.addEventListener('gamjassak-pet-diagnostics',listener);
    const samples:any={cpu:[],wasm:[]},results:any={};
    try {
      for(const backend of ['cpu','auto'] as const){
        await analyzePetImage('/pet-runtime.jpg',undefined,'unknown',undefined,backend); // cold run and weights transfer
        for(let i=0;i<3;i++){
          results[backend]=await analyzePetImage('/pet-runtime.jpg',undefined,'unknown',undefined,backend);
          samples[backend==='auto'?'wasm':'cpu'].push(diagnostics.at(-1));
        }
      }
      const cpu=results.cpu[0],wasm=results.auto[0];
      const cosine=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+value*b[i],0)/Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
      const [x,y,w,h]=wasm.box;
      const [face]=await analyzePetImage('/pet-runtime.jpg',undefined,'front',[{...wasm,view:'front',faceBox:[x+w*.2,y+h*.2,w*.3,h*.3]}]);
      const faceDiagnostics=diagnostics.at(-1);
      const [rear]=await analyzePetImage('/pet-runtime.jpg',undefined,'rear',[{...face,view:'rear'}]);
      const summarize=(rows:any[])=>({runs:rows.length,minMs:Math.min(...rows.map(r=>r.elapsedMs)),medianMs:rows.map(r=>r.elapsedMs).sort((a,b)=>a-b)[1],maxMs:Math.max(...rows.map(r=>r.elapsedMs)),tensorCounts:rows.map(r=>r.tensors)});
      return {cpuKind:cpu.kind,wasmKind:wasm.kind,cpuCount:results.cpu.length,wasmCount:results.auto.length,bodyCosine:cosine(cpu.appearance,wasm.appearance),mirrorCosine:cosine(cpu.mirroredAppearance,wasm.mirroredAppearance),maxBoxDifference:Math.max(...cpu.box.map((v:number,i:number)=>Math.abs(v-wasm.box[i]))),cpu:summarize(samples.cpu),wasm:summarize(samples.wasm),wasmBackends:samples.wasm.map((r:any)=>r.backend),faceLength:face.faceAppearance.length,bodyReusedExactly:face.appearance.every((v:number,i:number)=>v===wasm.appearance[i]),faceDiagnostics,rearBodyLength:rear.appearance.length,rearFaceLength:rear.faceAppearance.length,diagnostics};
    }finally{window.removeEventListener('gamjassak-pet-diagnostics',listener);cancelPetInference();}
  });
  await mkdir('preview-results',{recursive:true});await writeFile('preview-results/pet-runtime-benchmark.json',JSON.stringify(result,null,2));
  expect(result.cpuKind).toBe('dog');expect(result.wasmKind).toBe('dog');expect(result.cpuCount).toBe(result.wasmCount);
  expect(result.bodyCosine).toBeGreaterThan(.9999);expect(result.mirrorCosine).toBeGreaterThan(.9999);expect(result.maxBoxDifference).toBeLessThan(.001);
  expect(result.wasmBackends).toEqual(['wasm','wasm','wasm']);
  expect(new Set(result.wasm.tensorCounts).size).toBe(1);expect(new Set(result.cpu.tensorCounts).size).toBe(1);
  expect(result.faceLength).toBe(1024);expect(result.bodyReusedExactly).toBe(true);expect(result.faceDiagnostics.reusedBodies).toBe(1);
  expect(result.rearBodyLength).toBe(0);expect(result.rearFaceLength).toBe(0);expect(external).toEqual([]);
});

test('missing offline WASM binary falls back to CPU and still detects the dog',async({page,isMobile})=>{
  test.skip(isMobile,'CPU fallback model execution runs once.');test.setTimeout(120000);
  await page.route('**/pet-fallback.jpg',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.route('**/models/pets/runtime/*.wasm',route=>route.fulfill({status:404,body:''}));
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/features/pets/engine/client.ts';
    const {analyzePetImage,cancelPetInference}=await import(/* @vite-ignore */ path);
    let diagnostics:any;
    const listener=(event:Event)=>{diagnostics=(event as CustomEvent).detail;};
    window.addEventListener('gamjassak-pet-diagnostics',listener);
    try{const features=await analyzePetImage('/pet-fallback.jpg');return {kind:features[0]?.kind,diagnostics};}
    finally{window.removeEventListener('gamjassak-pet-diagnostics',listener);cancelPetInference();}
  });
  expect(result.kind).toBe('dog');expect(result.diagnostics.backend).toBe('cpu');expect(result.diagnostics.wasmFallback).toBe(true);
});

test('device measurement collects four own runs without identity results',async({page,isMobile})=>{
  test.skip(isMobile,'Real inference is covered once.');test.setTimeout(120000);
  await page.route('**/pet-device.jpg',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/features/pets/engine/deviceBenchmark.ts';
    const {measurePetRuntime}=await import(/* @vite-ignore */ path);
    const progress:number[]=[];
    return {report:await measurePetRuntime('/pet-device.jpg',new AbortController().signal,(n:number)=>progress.push(n)),progress};
  });
  expect(result.progress).toEqual([1,2,3,4]);expect(result.report.measurements).toHaveLength(4);expect(result.report.backends).toEqual(['wasm']);expect(result.report.medianInferenceMs).toBeGreaterThan(0);expect(new Set(result.report.tensorCounts).size).toBe(1);
  expect(result.report.identityAccuracyMeasured).toBe(false);expect(result.report.wholeAppPeakMemoryMeasured).toBe(false);expect(result.report.heatOrBatteryMeasured).toBe(false);expect(JSON.stringify(result.report)).not.toContain('appearance');
});
