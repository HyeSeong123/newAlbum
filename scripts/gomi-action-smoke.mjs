import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {reactionIssues} from './own-reaction-quality.mjs';
const run=promisify(execFile);
const adb=async(...args)=>(await run('adb',args,{timeout:30_000,maxBuffer:1024*1024})).stdout.trim();
export function assertOwnAssets(proof,expected){
 assert.equal(proof.modelSha256,expected.modelSha256,'Installed served model must match the source weights');
 assert.equal(proof.modelBytes,expected.modelBytes);assert.equal(proof.manifest.sha256,proof.modelSha256);assert.equal(proof.manifest.bytes,proof.modelBytes);
 assert.equal(proof.noticeSha256,expected.noticeSha256,'Installed served notice must match the source notice');
 assert.equal(proof.manifest.id,'own-character-v3');assert.equal(proof.initialization,'random');
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
async function installProbe(page){
 await page.evaluate(()=>{
  const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  if(window.__gomiSmokeOriginalRandom){Math.random=window.__gomiSmokeOriginalRandom;delete window.__gomiSmokeOriginalRandom;}
  window.__ownAiForbiddenCalls=[];window.__ownAiRequests=[];
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(message,...args){
   if(message?.input?.characterId&&Number.isFinite(message.seed))window.__ownAiRequests.push(structuredClone(message));
   return Reflect.apply(post,this,[message,...args]);
  };
  window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>{
   if(command==='generate_chat_reply'||command==='download_chat_model'){
    window.__ownAiForbiddenCalls.push(command);throw new Error('External character AI boundary was called');
   }
   return original(command,args,...rest);
  };
 });
}
async function pressAndPaint(page,selector){
 await page.locator('#homeMessage').scrollIntoViewIfNeeded();
 const record=await page.evaluate(selector=>new Promise((resolve,reject)=>{
  const before=document.querySelector('#homeMessage')?.textContent,started=performance.now();let finished=false;
  const dispose=()=>{finished=true;clearTimeout(timer);};
  const visible=node=>{
   const box=node.getBoundingClientRect(),x=box.left+box.width/2;
   return box.top>=0&&box.bottom<=innerHeight&&[box.top+2,box.top+box.height/2,box.bottom-2].every(y=>{
    const hit=document.elementFromPoint(x,y);return hit!=null&&node.contains(hit);
   });
  };
  const check=()=>{
   if(finished)return;
   const node=document.querySelector('#homeMessage');
   if(node?.getAttribute('data-source')==='on-device'&&node.textContent!==before&&visible(node)){
    const candidate=node.textContent;
    requestAnimationFrame(()=>{
     if(finished)return;
     const painted=document.querySelector('#homeMessage');
     if(painted?.getAttribute('data-source')==='on-device'&&painted.textContent===candidate&&visible(painted)){
      const elapsedMs=performance.now()-started;dispose();resolve({source:'on-device',line:candidate,elapsedMs});
     }else requestAnimationFrame(check);
    });
   }else requestAnimationFrame(check);
  };
  const timer=setTimeout(()=>{dispose();reject(new Error('No complete own-AI response within 1 second: '+document.querySelector('#homeMessage')?.textContent));},1000);
  const button=document.querySelector(selector);if(!button){dispose();reject(new Error('Missing action: '+selector));return;}button.click();
  requestAnimationFrame(check);
 }),selector);
 record.request=await page.evaluate(()=>window.__ownAiRequests.at(-1));
 assert.ok(record.request,'Actual Home action must reach the own neural Worker');
 assert.deepEqual(reactionIssues(record.request.input,record.line),[]);
 assert.deepEqual(await page.evaluate(()=>window.__ownAiForbiddenCalls),[]);
 return record;
}
/** Actual installed Home -> persisted relationship/state -> own Worker -> painted line. */
export async function verifyInstalledGomiAction(page,output='test-results/android-smoke',{offline=true}={}){
 let previousAirplane,previousWifi,previousData;
 const records=[],foodBehaviour=[];
 try{
  if(offline){
   assert.match(await adb('get-serialno'),/^emulator-/,'Automatic radio controls are restricted to the CI emulator');
   previousAirplane=await adb('shell','settings','get','global','airplane_mode_on');
   previousWifi=await adb('shell','settings','get','global','wifi_on');previousData=await adb('shell','settings','get','global','mobile_data');
   await adb('shell','cmd','connectivity','airplane-mode','enable');
   await adb('shell','svc','wifi','disable');await adb('shell','svc','data','disable');
   assert.equal(await adb('shell','settings','get','global','airplane_mode_on'),'1');
  }
  await page.evaluate(async()=>{
   localStorage.setItem('geuruteogi.first-run-completed-v1','true');
   await window.__TAURI_INTERNALS__.invoke('sync_characters');
   await window.__TAURI_INTERNALS__.invoke('set_main_character',{id:'gomi'});
  });
  // Harness-only deterministic initial sleep pose. Model sampling still uses
  // crypto random seeds. The flag is removed before unrelated UI tests run.
  await page.addInitScript(()=>{
   if(sessionStorage.getItem('gomi:smoke-force-sleep')==='1'){
    window.__gomiSmokeOriginalRandom=Math.random;Math.random=()=>0.45;
   }
  });
  const reset=async energy=>{
   await page.evaluate(energy=>{
    sessionStorage.setItem('gomi:smoke-force-sleep','1');
    localStorage.setItem('gamjassak:companion:v1:gomi',JSON.stringify({version:1,mood:'sleepy',energy,history:[]}));
   },energy);
   await page.reload();await page.waitForSelector('.homeMascot');
   await page.waitForFunction(()=>document.querySelector('#homeMessage')?.textContent&&!document.querySelector('#homeMessage').textContent.includes('친구를 준비하고'));
   await page.waitForSelector('.homeMascot [data-motion="sleep-curled"]');
   await installProbe(page);
  };
  await reset(1);
  for(let index=0;index<8;index++)records.push({...await pressAndPaint(page,'.homeMascot'),scenario:'sleep-touch'});
  for(const energy of [1,0]){
   await reset(energy);
   const affectionBefore=await page.evaluate(async()=>(await window.__TAURI_INTERNALS__.invoke('sync_characters')).characters.find(row=>row.id==='gomi').affection);
   await page.getByRole('button',{name:'함께하기',exact:true}).click();
   await page.evaluate(()=>{
    window.__ownMotionTrace=[];
    const capture=()=>{
     const motion=document.querySelector('.homeMascot [data-motion]')?.getAttribute('data-motion');
     if(motion&&motion!==window.__ownMotionTrace.at(-1)?.motion)window.__ownMotionTrace.push({motion,at:performance.now()});
    };
    const observer=new MutationObserver(capture);
    observer.observe(document.querySelector('.homeMascot'),{attributes:true,subtree:true,childList:true,attributeFilter:['data-motion']});
    window.__stopOwnMotionTrace=()=>observer.disconnect();capture();
   });
   const record={...await pressAndPaint(page,'[data-help="companion-treat"]'),scenario:energy?'sleepy-snack':'exhausted-snack'};
   records.push(record);assert.equal(record.request.input.energy,energy);assert.equal(record.request.input.sleeping,true);assert.equal(record.request.input.action,'treat');
   const firstMotion=await page.locator('.homeMascot [data-motion]').getAttribute('data-motion');
   assert.equal(firstMotion,energy?'sleep-curled-peek':'sleep-curled');
   const snapshot=await page.evaluate(async()=>({memory:JSON.parse(localStorage.getItem('gamjassak:companion:v1:gomi')),
    affection:(await window.__TAURI_INTERNALS__.invoke('sync_characters')).characters.find(row=>row.id==='gomi').affection}));
   assert.equal(snapshot.memory.energy,energy,'Offering food must not pre-emptively energize a sleeper');
   assert.equal(snapshot.memory.mood,energy?'curious':'sleepy');assert.equal(snapshot.affection,affectionBefore,'Offering food must not incur a sleep-disturbance penalty');
   if(output){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,energy?'gomi-food-sleepy.png':'gomi-food-exhausted.png')});}
   if(energy){
    // Observe from before the click: taking a screenshot can outlast the
    // one-second dazed pose, so polling only afterwards can miss a real phase.
    await page.waitForFunction(()=>window.__ownMotionTrace.some(row=>row.motion==='rest-front')&&
     ['cynical','idle'].includes(window.__ownMotionTrace.at(-1)?.motion),undefined,{timeout:5000});
   }
   const motionTrace=await page.evaluate(()=>{window.__stopOwnMotionTrace();return window.__ownMotionTrace;});
   const motionSequence=motionTrace.map(row=>row.motion).slice(energy?1:0);
   if(energy){assert.deepEqual(motionSequence.slice(0,2),['sleep-curled-peek','rest-front']);assert.ok(['idle','cynical'].includes(motionSequence.at(-1)));}
   else assert.deepEqual(motionSequence,['sleep-curled']);
   foodBehaviour.push({energy,line:record.line,elapsedMs:record.elapsedMs,motionSequence,motionTrace,memory:snapshot.memory,affectionBefore,affectionAfter:snapshot.affection});
  }
  const timings=assertOwnTimings(records);
  const expectedModel=await readFile(new URL('../src/features/characters/ownAi/model.json',import.meta.url));
  const expectedNotice=await readFile(new URL('../public/notices/companion-ai-NOTICE.txt',import.meta.url));
  const proof=await page.evaluate(async()=>{
   const get=async path=>{const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error('Missing served APK asset: '+path);return new Uint8Array(await response.arrayBuffer());};
   const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   const decoder=new TextDecoder(),raw=await get('/character-ai/model.json'),notice=await get('/notices/companion-ai-NOTICE.txt'),model=JSON.parse(decoder.decode(raw));
   return {modelBytes:raw.length,modelSha256:await digest(raw),noticeSha256:await digest(notice),manifest:JSON.parse(decoder.decode(await get('/character-ai/manifest.json'))),
    initialization:model.provenance.initialization,pretrainedParents:model.provenance.pretrainedParents,teacherModel:model.provenance.teacherModel};
  });
  assertOwnAssets(proof,{modelBytes:expectedModel.length,modelSha256:createHash('sha256').update(expectedModel).digest('hex'),noticeSha256:createHash('sha256').update(expectedNotice).digest('hex')});
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  const setup=page.getByRole('dialog',{name:'AI 반응 설정',exact:true});
  await setup.getByRole('heading',{name:'곰고미 전용 AI가 준비됐어요',exact:true}).waitFor();assert.doesNotMatch(await setup.innerText(),/HyperCLOVA|Qwen|2\.5GB|Powered by/);
  if(output)await page.screenshot({path:join(output,'gomi-own-ai-setup.png')});
  await setup.getByRole('button',{name:'AI 반응 설정 닫기',exact:true}).click();
  const evidence={model:proof.manifest.id,modelBytes:proof.modelBytes,modelSha256:proof.modelSha256,assetProof:proof,records,timings,foodBehaviour,
   airplaneModeEnabled:offline,wifiAndDataDisabled:offline,externalCharacterAiCalls:[],syntheticInput:true,phonePerformanceMeasured:false,
   offlinePageReload:offline,firstInteractionAfterReloadMs:records[0].elapsedMs,homePrewarmingEnabled:true,
   scope:'Installed x86_64 emulator, eight sleep touches and two real snack buttons; complete text after a render opportunity. Not Galaxy26 hardware. Meal is PC-tested; no meal button exists.'};
  if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'gomi-action-smoke.json'),JSON.stringify(evidence,null,2)+'\n');}
  return evidence;
 }catch(error){
  if(output){
   await mkdir(output,{recursive:true});const requests=await page.evaluate(()=>window.__ownAiRequests||[]).catch(()=>[]);
   const motionTrace=await page.evaluate(()=>window.__ownMotionTrace||[]).catch(()=>[]);
   await writeFile(join(output,'gomi-action-failure.json'),JSON.stringify({records,foodBehaviour,requests,motionTrace,error:String(error),syntheticInput:true},null,2)+'\n');
  }
  throw error;
 }finally{
  await page.evaluate(()=>{sessionStorage.removeItem('gomi:smoke-force-sleep');if(window.__gomiSmokeOriginalRandom)Math.random=window.__gomiSmokeOriginalRandom;}).catch(()=>{});
  if(previousAirplane!=null)await adb('shell','cmd','connectivity','airplane-mode',previousAirplane==='1'?'enable':'disable');
  if(previousWifi!=null)await adb('shell','svc','wifi',previousWifi==='1'||previousWifi==='2'?'enable':'disable');
  if(previousData!=null)await adb('shell','svc','data',previousData==='1'?'enable':'disable');
 }
}
