import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

const run=promisify(execFile);
const adb=async(...args)=>(await run('adb',args,{timeout:30_000,maxBuffer:1024*1024})).stdout.trim();

/** Installed production APK/JNI only. Inputs and recorded text are synthetic QA. */
export async function verifyInstalledGomiAction(page, output='test-results/android-smoke', {offline=true}={}) {
  const fixture=JSON.parse(await readFile(new URL('../local-ai/quality-v3/home-prompt-fixtures.json',import.meta.url),'utf8'));
  const sample=fixture.cases.find(row=>row.input.action==='touch' && row.input.affection===75 && !row.input.sleeping);
  assert.ok(sample,'Frozen synthetic Home prompt must exist');
  let previousAirplane;
  let previousWifi;
  let previousData;
  try {
    if(offline){
      assert.match(await adb('get-serialno'),/^emulator-/,'Offline controls are restricted to the CI emulator');
      previousAirplane=await adb('shell','settings','get','global','airplane_mode_on');
      previousWifi=await adb('shell','settings','get','global','wifi_on');
      previousData=await adb('shell','settings','get','global','mobile_data');
      await adb('shell','cmd','connectivity','airplane-mode','enable');
      await adb('shell','svc','wifi','disable');
      await adb('shell','svc','data','disable');
      assert.equal(await adb('shell','settings','get','global','airplane_mode_on'),'1','Emulator must be offline before inference');
    }
    const result=await page.evaluate(async ({prompt,fixtureId})=>{
      const invoke=window.__TAURI_INTERNALS__.invoke;
      const scope={characterId:'gomi',usage:'home-actions'};
      const before=await invoke('chat_model_status',scope);
      if(before.model!=='gomi-action-v3'||!before.bundled||!before.supported||!before.installed)throw new Error('Bundled Gomi model is not ready in installed APK');
      // Force a cold load; do not borrow a previously resident shared model.
      await invoke('release_chat_model',{sessionId:''});
      const sessionId='synthetic-gomi-smoke-'+Date.now();
      const started=performance.now();
      try {
        let timer;
        const rawReply=await Promise.race([
          invoke('generate_chat_reply',{...scope,prompt,sessionId}),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Installed Gomi generation timed out')),330_000);}),
        ]).finally(()=>clearTimeout(timer));
        const elapsedMs=performance.now()-started;
        const after=await invoke('chat_model_status',scope);
        return {fixtureId,prompt,rawReply,elapsedMs,before,after};
      } finally { await invoke('release_chat_model',{sessionId}); }
    },{prompt:sample.serialized,fixtureId:sample.id});
    const runtime=result.after.runtime;
    assert.equal(result.after.model,'gomi-action-v3');
    assert.equal(result.after.lastOutcome,'success');
    assert.equal(runtime?.gomiActionApplied,true,'Native compact model must actually execute');
    assert.equal(runtime?.gomiLoraApplied,false,'Compact model must not apply old v4 LoRA');
    assert.ok(runtime.loadCount>=1 && runtime.promptTokens>0 && runtime.totalMs>0,'Real JNI inference metrics must be present');
    assert.equal(result.after.downloaded,0,'Bundled model needs no model download');
    assert.equal(result.after.upgradeAvailable,false);
    assert.equal(typeof result.rawReply,'string');
    assert.ok(/[가-힣]/.test(result.rawReply),'Actual generated output must contain Korean');
    assert.ok(result.rawReply.trim().length>=2 && result.rawReply.length<=300,'Actual output must be bounded and nonempty');
    assert.ok(!/<\|[^>]*\|>|<\/?think>|(?:^|\n)\s*(?:user|system|assistant)\s*:/i.test(result.rawReply),'Generated output must not leak role or thought markers');
    const evidence={...result,airplaneModeEnabled:offline,wifiAndDataDisabled:offline,downloadRequested:false,syntheticInput:true,phonePerformanceMeasured:false};
    if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'gomi-action-smoke.json'),JSON.stringify(evidence,null,2)+'\n');}
    return evidence;
  } finally {
    if(previousAirplane!=null)await adb('shell','cmd','connectivity','airplane-mode',previousAirplane==='1'?'enable':'disable');
    if(previousWifi!=null)await adb('shell','svc','wifi',previousWifi==='1'||previousWifi==='2'?'enable':'disable');
    if(previousData!=null)await adb('shell','svc','data',previousData==='1'?'enable':'disable');
  }
}
