import { expect, test } from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('Worker detects dog locally and keeps main thread responsive with cancel/retry', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Actual model inference runs once; the review UI is tested on both viewports.');
  test.setTimeout(240000);
  await page.route('**/pet-test.jpg', route => route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.route('**/pet-cat.jpg', route => route.fulfill({path:'tests/fixtures/pet-cat-front.jpg',contentType:'image/jpeg'}));
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
    const features=await analyzePetImage('/pet-test.jpg');const negative=await analyzePetImage('/pet-negative.jpg');const cats=await analyzePetImage('/pet-cat.jpg');const hardCats=await analyzePetImage('/pet-hard-cat.jpg');
    const object=features[0], [x,y,w,h]=object.box;
    const front=await analyzePetImage('/pet-test.jpg',undefined,'front',[{...object,view:'front',faceBox:[x+w*0.2,y+h*0.2,w*0.3,h*0.3]}]);
    const rear=await analyzePetImage('/pet-test.jpg',undefined,'rear',[{...front[0],view:'rear'}]);
    if(front[0].faceAppearance.length!==1024 || rear[0].appearance.length || rear[0].faceAppearance.length || rear[0].faceBox)throw new Error('face/rear extraction policy failed');
    clearInterval(interval);
    return {hardCatCount:hardCats.length,hardCatAutomaticLinks:hardCats.filter((f:any)=>recognizePet(f,[]).autoPetId!==null).length,catCount:cats.length,catKind:cats[0]?.kind,catLength:cats[0]?.appearance.length,aborted,count:features.length,negative:negative.length,kind:features[0]?.kind,view:features[0]?.view,length:features[0]?.appearance.length,color:features[0]?.color.length,shape:features[0]?.shape.length,score:comparePets(features[0],features[0]).score,auto:recognizePet(features[0],[{petId:1,features:features[0]}]).autoPetId,ticks,elapsedMs:performance.now()-started};
  });
  await mkdir('preview-results',{recursive:true});await writeFile('preview-results/pet-worker-smoke.json',JSON.stringify(result,null,2));
  console.log('Pet Worker smoke (NOT identity accuracy):',JSON.stringify(result));
  expect(result.hardCatAutomaticLinks).toBe(0);expect(result.aborted).toBe(true);expect(result.count).toBeGreaterThan(0);expect(result.kind).toBe('dog');expect(result.view).toBe('unknown');expect(result.length).toBe(1024);expect(result.color).toBe(120);expect(result.shape).toBe(10);expect(result.score).toBeCloseTo(1,4);expect(result.auto).toBeNull();expect(result.negative).toBe(0);expect(result.catCount).toBeGreaterThan(0);expect(result.catKind).toBe('cat');expect(result.catLength).toBe(1024);expect(result.ticks).toBeGreaterThan(10);expect(external).toEqual([]);
});
