import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

const run=promisify(execFile);
const adb=async(...args)=>(await run('adb',args,{timeout:30_000,maxBuffer:1024*1024})).stdout.trim();
export function assertOwnAssets(proof,expected){
 assert.equal(proof.modelSha256,expected.modelSha256,'Installed served model must match the source weights');
 assert.equal(proof.modelBytes,expected.modelBytes);assert.equal(proof.manifest.sha256,proof.modelSha256);assert.equal(proof.manifest.bytes,proof.modelBytes);
 assert.equal(proof.noticeSha256,expected.noticeSha256,'Installed served notice must match the source notice');
 assert.equal(proof.manifest.id,'own-character-v1');assert.equal(proof.initialization,'random');
 assert.deepEqual(proof.pretrainedParents,[]);assert.equal(proof.teacherModel,null);
}
export function assertOwnTimings(records,targetMs=1000){
 assert.ok(records.length>=1,'At least one complete visible reply is required');
 for(const record of records){
  assert.equal(record.source,'on-device','An error or fallback is not a successful fast response');
  assert.match(record.line,/[가-힣]/);assert.ok(Array.from(record.line).length<=50);
  assert.ok(record.elapsedMs>0&&record.elapsedMs<targetMs,`Full visible reaction took ${record.elapsedMs}ms (target ${targetMs}ms)`);
 }
 const sorted=records.map(row=>row.elapsedMs).sort((a,b)=>a-b);
 return {samples:records.length,p50Ms:sorted[Math.floor((sorted.length-1)*0.5)],p95Ms:sorted[Math.ceil((sorted.length-1)*0.95)],maxMs:sorted.at(-1)};
}

/** Actual installed app UI -> stored relationship -> own Worker -> painted line. */
export async function verifyInstalledGomiAction(page,output='test-results/android-smoke',{offline=true}={}){
 let previousAirplane,previousWifi,previousData;
 try{
  if(offline){
   assert.match(await adb('get-serialno'),/^emulator-/,'Automatic radio controls are restricted to the CI emulator');
   previousAirplane=await adb('shell','settings','get','global','airplane_mode_on');
   previousWifi=await adb('shell','settings','get','global','wifi_on');
   previousData=await adb('shell','settings','get','global','mobile_data');
   await adb('shell','cmd','connectivity','airplane-mode','enable');
   await adb('shell','svc','wifi','disable');await adb('shell','svc','data','disable');
   assert.equal(await adb('shell','settings','get','global','airplane_mode_on'),'1');
  }
  await page.evaluate(async()=>{
   localStorage.setItem('geuruteogi.first-run-completed-v1','true');
   await window.__TAURI_INTERNALS__.invoke('sync_characters');
   await window.__TAURI_INTERNALS__.invoke('set_main_character',{id:'gomi'});
  });
  await page.reload();
  await page.waitForSelector('.homeMascot');
  await page.waitForFunction(()=>document.querySelector('#homeMessage')?.textContent&&!document.querySelector('#homeMessage').textContent.includes('친구를 준비하고'));
  await page.evaluate(()=>{
   const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
   window.__ownAiForbiddenCalls=[];
   window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>{
    if(command==='generate_chat_reply'||command==='download_chat_model'){
     window.__ownAiForbiddenCalls.push(command);throw new Error('External character AI boundary was called');
    }
    return original(command,args,...rest);
   };
  });
  const records=[];
  for(let index=0;index<8;index++){
   records.push(await page.evaluate(()=>new Promise((resolve,reject)=>{
    const before=document.querySelector('#homeMessage')?.textContent;
    const started=performance.now();let finished=false;
    const dispose=()=>{finished=true;clearTimeout(timer);observer.disconnect();};
    const observer=new MutationObserver(()=>{
     const node=document.querySelector('#homeMessage');
     if(finished||node?.getAttribute('data-source')!=='on-device'||node.textContent===before)return;
     // Double rAF includes a render opportunity after the complete text update.
     requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(finished)return;const line=node.textContent,elapsedMs=performance.now()-started;dispose();
      resolve({source:'on-device',line,elapsedMs});
     }));
    });
    const timer=setTimeout(()=>{dispose();reject(new Error('No complete own-AI response within 1 second: '+document.querySelector('#homeMessage')?.textContent));},1000);
    observer.observe(document.querySelector('.homeDialogueSlot'),{childList:true,subtree:true,characterData:true,attributes:true});
    document.querySelector('.homeMascot').click();
   })));
  }
  const timings=assertOwnTimings(records);
  assert.deepEqual(await page.evaluate(()=>window.__ownAiForbiddenCalls),[]);
  const expectedModel=await readFile(new URL('../src/features/characters/ownAi/model.json',import.meta.url));
  const expectedNotice=await readFile(new URL('../public/notices/companion-ai-NOTICE.txt',import.meta.url));
  const proof=await page.evaluate(async()=>{
   const get=async path=>{const response=await fetch(path);if(!response.ok)throw new Error('Missing served APK asset: '+path);return new Uint8Array(await response.arrayBuffer());};
   const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   const decoder=new TextDecoder();const raw=await get('/character-ai/model.json'),notice=await get('/notices/companion-ai-NOTICE.txt');
   const model=JSON.parse(decoder.decode(raw));
   return {modelBytes:raw.length,modelSha256:await digest(raw),noticeSha256:await digest(notice),
    manifest:JSON.parse(decoder.decode(await get('/character-ai/manifest.json'))),
    initialization:model.provenance.initialization,pretrainedParents:model.provenance.pretrainedParents,teacherModel:model.provenance.teacherModel};
  });
  assertOwnAssets(proof,{modelBytes:expectedModel.length,modelSha256:createHash('sha256').update(expectedModel).digest('hex'),noticeSha256:createHash('sha256').update(expectedNotice).digest('hex')});
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'AI 반응 설정',exact:true});
  await setup.getByRole('heading',{name:'곰고미 전용 AI가 준비됐어요',exact:true}).waitFor();
  assert.doesNotMatch(await setup.innerText(),/HyperCLOVA|Qwen|2\.5GB|Powered by/);
  if(output){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'gomi-own-ai-setup.png')});}
  await setup.getByRole('button',{name:'AI 반응 설정 닫기',exact:true}).click();
  const evidence={model:proof.manifest.id,modelBytes:proof.modelBytes,modelSha256:proof.modelSha256,assetProof:proof,records,timings,
   airplaneModeEnabled:offline,wifiAndDataDisabled:offline,externalCharacterAiCalls:[],syntheticInput:true,phonePerformanceMeasured:false,
   offlinePageReload:offline,firstInteractionAfterReloadMs:records[0].elapsedMs,homePrewarmingEnabled:true,
   scope:'Installed x86_64 emulator UI, full text after a render opportunity. Not Galaxy26 hardware.'};
  if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'gomi-action-smoke.json'),JSON.stringify(evidence,null,2)+'\n');}
  return evidence;
 }finally{
  if(previousAirplane!=null)await adb('shell','cmd','connectivity','airplane-mode',previousAirplane==='1'?'enable':'disable');
  if(previousWifi!=null)await adb('shell','svc','wifi',previousWifi==='1'||previousWifi==='2'?'enable':'disable');
  if(previousData!=null)await adb('shell','svc','data',previousData==='1'?'enable':'disable');
 }
}
