import {expect,test}from'@playwright/test';
import {readFile,writeFile}from'node:fs/promises';
test('compare unchanged COCO weights on 100 dog and 100 cat images',async({page})=>{
 test.setTimeout(900000);const manifest=JSON.parse(await readFile('benchmark-results/oxford-manifest.json','utf8'));
 await page.goto('/');
 const result=await page.evaluate(async samples=>{const path='/benchmarks/detection-client.ts';const {compareDetectionPolicies}=await import(/* @vite-ignore */path);return compareDetectionPolicies(samples);},manifest.samples);
 const summary:any={};
 for(const policy of ['before-0.9.20','after-0.9.21'])for(const kind of ['dog','cat']){
  const rows=result.results.filter((row:any)=>row.policy===policy&&row.kind===kind);expect(rows).toHaveLength(100);
  const times=rows.map((row:any)=>row.elapsedMs).sort((a:number,b:number)=>a-b);const found=rows.filter((row:any)=>row.hit).length;
  summary[`${policy}:${kind}`]={photos:100,hits:found,misses:100-found,hitRate:found/100,missRate:(100-found)/100,medianMs:(times[49]+times[50])/2,p95Ms:times[94],maxObservedTensorBytes:Math.max(...rows.map((r:any)=>r.observedTensorBytes))};
 }
 await writeFile('benchmark-results/oxford-detection-results.json',JSON.stringify({...result,summary},null,2));console.log('Detection comparison only:',JSON.stringify(summary));
});
