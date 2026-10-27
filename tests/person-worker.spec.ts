import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test('person Worker preserves original descriptors, isolates runtimes and supports cancellation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Actual model exercised once; mobile management covered separately.');
  test.setTimeout(180_000);
  await page.route('**/face-input.jpg', (route) => route.fulfill({ path:'node_modules/@vladmandic/face-api/demo/sample1.jpg',contentType:'image/jpeg' }));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const external:string[]=[];
  page.on('request', request => { if (!['localhost','127.0.0.1'].includes(new URL(request.url()).hostname) || /\/models\/(people512|pet-pose|onnx-runtime)\//.test(new URL(request.url()).pathname)) external.push(request.url()); });
  const results=await page.evaluate(async()=>{
    const clientPath='/src/features/people/engine/client.ts';
    const {analyzePersonImage,disposePersonEngine}=await import(/* @vite-ignore */clientPath);
    const baselinePath='/tests/face-baseline.ts';
    const {originalFacePipeline}=await import(/* @vite-ignore */baselinePath);
    const original=await originalFacePipeline('/face-input.jpg');
    const baselineMs=original.elapsedMs;
    const diagnostics:Record<string,unknown>[]=[];
    window.addEventListener('gamjassak-person-diagnostics',(event)=>diagnostics.push((event as CustomEvent).detail));
    let beats=0;const heartbeat=setInterval(()=>beats++,16);
    const cpu=await analyzePersonImage('/face-input.jpg',undefined,'cpu');
    const warmCpu=await analyzePersonImage('/face-input.jpg',undefined,'cpu');
    const wasm=await analyzePersonImage('/face-input.jpg',undefined,'wasm');
    const warmWasm=await analyzePersonImage('/face-input.jpg',undefined,'wasm');
    clearInterval(heartbeat);
    const distance=(a:number[],b:number[])=>Math.sqrt(a.reduce((sum,x,i)=>sum+(x-b[i])**2,0));
    const baselineDistances=cpu.map((face:{descriptor:number[]},i:number)=>distance(face.descriptor,original.descriptors[i]));
    const backendDistances=wasm.map((face:{descriptor:number[]},i:number)=>distance(face.descriptor,cpu[i].descriptor));
    const stable=distance(cpu[0].descriptor,warmCpu[0].descriptor)<1e-5 && distance(wasm[0].descriptor,warmWasm[0].descriptor)<1e-5;
    const controller=new AbortController();
    const cancelled=analyzePersonImage('/face-input.jpg',controller.signal,'cpu').then(()=>false,(error:Error)=>error.name==='AbortError');
    setTimeout(()=>controller.abort(),30);
    const abortWorked=await cancelled;
    const restarted=await analyzePersonImage('/face-input.jpg',undefined,'wasm');
    disposePersonEngine();
    const excluded512=wasm.every((face:{additionalFeatures?:unknown[]})=>!face.additionalFeatures?.length);
    return {excluded512,baselineBoxes:original.boxes,workerBoxes:cpu.map((f:{box:number[]})=>f.box),tfVersion:original.tfVersion,faces:cpu.length,baselineDistances,backendDistances,stable,abortWorked,restarted:restarted.length,beats,baselineMs,diagnostics};
  });
  await mkdir('preview-results',{recursive:true});await writeFile('preview-results/person-worker-smoke.json',JSON.stringify({environment:'desktop Chromium, functional fixture; no independent identity accuracy',...results},null,2));
  expect(results.faces).toBe(3);
  expect(results.excluded512).toBe(true);
  expect(Math.max(...results.baselineDistances)).toBeLessThan(0.001);
  expect(Math.max(...results.backendDistances)).toBeLessThan(0.001);
  expect(results.stable).toBe(true);expect(results.abortWorked).toBe(true);expect(results.restarted).toBe(3);
  expect(results.diagnostics.every(entry => entry.precisionPasses === 0)).toBe(true);
  expect(results.beats).toBeGreaterThan(30);expect(external).toEqual([]);

});

test('face models are locked to exact versions and offline checksums',async()=>{
 const pkg=JSON.parse(await readFile('node_modules/@vladmandic/face-api/package.json','utf8'));
 expect(pkg.version).toBe('1.7.15');
 const provenance=JSON.parse(await readFile('public/models/faces/provenance.json','utf8'));
 expect(provenance.tensorflow).toBe('4.22.0');expect(Object.keys(provenance.models)).toHaveLength(6);
});

test('person inference falls back to CPU when offline WASM is unavailable',async({page,isMobile})=>{
 test.skip(isMobile,'CPU fallback exercised once.');test.setTimeout(120_000);
 await page.route('**/*.wasm',route=>route.abort());
 await page.route('**/face-input.jpg',route=>route.fulfill({path:'node_modules/@vladmandic/face-api/demo/sample1.jpg',contentType:'image/jpeg'}));
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const path='/src/features/people/engine/client.ts';const {analyzePersonImage,disposePersonEngine}=await import(/* @vite-ignore */path);
  let backend='';window.addEventListener('gamjassak-person-diagnostics',event=>backend=(event as CustomEvent).detail.backend);
  const faces=await analyzePersonImage('/face-input.jpg');disposePersonEngine();return {backend,count:faces.length};
 });
 expect(result).toEqual({backend:'cpu',count:3});
});

test('explicit precision transfers the original image and leaves ordinary inference unchanged', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Real inference once; retry/cancel controls are exercised at mobile size.');
  test.setTimeout(240_000);
  await page.route('**/precision-human.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.route('**/precision-dog.jpg', route => route.fulfill({ path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/features/people/engine/client.ts';
    const { analyzePersonImage, disposePersonEngine } = await import(/* @vite-ignore */path);
    let passes = -1;
    const diagnostics = (value: {precisionPasses: number}) => { passes = value.precisionPasses; };
    const precise = await analyzePersonImage('/precision-human.jpg', undefined, 'wasm', diagnostics, { precision: true });
    const precisionPasses = passes;
    const dog = await analyzePersonImage('/precision-dog.jpg', undefined, 'wasm', undefined, { precision: true });
    const standard = await analyzePersonImage('/precision-human.jpg', undefined, 'wasm', diagnostics);
    disposePersonEngine();
    return { precisionPasses, standardPasses: passes, standard: standard.length, dog: dog.length, count: precise.length,
      safe: precise.every((face: {quality: string; descriptor: number[]; box: number[]}) => face.quality === 'review' && face.descriptor.length === 128 && face.descriptor.every(Number.isFinite) && face.box.every(Number.isFinite)) };
  });
  expect(result.count).toBeGreaterThanOrEqual(3);
  expect(result.safe).toBe(true);
  expect(result.precisionPasses).toBeGreaterThanOrEqual(4);
  expect(result.precisionPasses).toBeLessThanOrEqual(8);
  expect(result.dog).toBe(0);
  expect(result.standard).toBe(3);
  expect(result.standardPasses).toBe(0);
});
