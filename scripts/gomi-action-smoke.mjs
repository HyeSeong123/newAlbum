import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

const run=promisify(execFile);
const adb=async(...args)=>(await run('adb',args,{timeout:30_000,maxBuffer:1024*1024})).stdout.trim();
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
  await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('set_main_character',{id:'gomi'}));
  await page.reload();
  await page.waitForSelector('.homeMascot');
  await page.waitForFunction(()=>document.querySelector('#homeMessage')?.textContent&&!document.querySelector('#homeMessage').textContent.includes('친구를 준비하고'));
  await page.evaluate(()=>{
   const original=window.__TAURI_INTERNALS__.invoke;
   window.__ownAiForbiddenCalls=[];
   window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>{
    if(command==='generate_chat_reply'||command==='download_chat_model'){
     window.__ownAiForbiddenCalls.push(command);throw new Error('External character AI boundary was called');
    }
    return original(command,args,...rest);
   };
  });
  if(offline){
   assert.match(await adb('get-serialno'),/^emulator-/,'Automatic radio controls are restricted to the CI emulator');
   previousAirplane=await adb('shell','settings','get','global','airplane_mode_on');
   previousWifi=await adb('shell','settings','get','global','wifi_on');
   previousData=await adb('shell','settings','get','global','mobile_data');
   await adb('shell','cmd','connectivity','airplane-mode','enable');
   await adb('shell','svc','wifi','disable');await adb('shell','svc','data','disable');
   assert.equal(await adb('shell','settings','get','global','airplane_mode_on'),'1');
  }
  const manifest=await page.evaluate(async()=>{
   const response=await fetch('/character-ai/manifest.json');if(!response.ok)throw new Error('APK own model missing');return response.json();
  });
  assert.equal(manifest.id,'own-character-v1');assert.equal(manifest.initialization,'random');
  assert.deepEqual(manifest.pretrainedParents,[]);assert.equal(manifest.teacherModel,null);
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
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'AI 반응 설정',exact:true});
  await setup.getByRole('heading',{name:'곰고미 전용 AI가 준비됐어요',exact:true}).waitFor();
  assert.doesNotMatch(await setup.innerText(),/HyperCLOVA|Qwen|2\.5GB|Powered by/);
  if(output){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'gomi-own-ai-setup.png')});}
  await setup.getByRole('button',{name:'AI 반응 설정 닫기',exact:true}).click();
  const evidence={model:manifest.id,modelBytes:manifest.bytes,modelSha256:manifest.sha256,records,timings,
   airplaneModeEnabled:offline,wifiAndDataDisabled:offline,externalCharacterAiCalls:[],syntheticInput:true,phonePerformanceMeasured:false,
   scope:'Installed x86_64 emulator UI, full text after a render opportunity. Not Galaxy26 hardware.'};
  if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'gomi-action-smoke.json'),JSON.stringify(evidence,null,2)+'\n');}
  return evidence;
 }finally{
  if(previousAirplane!=null)await adb('shell','cmd','connectivity','airplane-mode',previousAirplane==='1'?'enable':'disable');
  if(previousWifi!=null)await adb('shell','svc','wifi',previousWifi==='1'||previousWifi==='2'?'enable':'disable');
  if(previousData!=null)await adb('shell','svc','data',previousData==='1'?'enable':'disable');
 }
}
