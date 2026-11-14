import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const source=new URL('../scripts/gomi-action-smoke.mjs',import.meta.url);
test('installed Gomi inference smoke exists',()=>assert.ok(existsSync(source)));
if(existsSync(source)){
 const {verifyInstalledGomiAction}=await import(source);
 const status={model:'gomi-action-v3',phase:'ready',supported:true,installed:true,bundled:true,downloaded:0,upgradeAvailable:false,
  runtime:{gomiActionApplied:true,gomiLoraApplied:false,resident:true,loadCount:1,promptTokens:100,totalMs:10},lastOutcome:'success'};
 test('smoke invokes actual native Home scope and rejects missing native proof',async()=>{
  const calls=[];
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{calls.push({command,args});return command==='chat_model_status'?status:command==='generate_chat_reply'?'내 옆에 있어.':undefined;}}};
  const page={evaluate:async(fn,args)=>fn(args)};
  const result=await verifyInstalledGomiAction(page,null,{offline:false});
  assert.equal(result.rawReply,'내 옆에 있어.');
  const generation=calls.find(call=>call.command==='generate_chat_reply');
  assert.equal(generation.args.characterId,'gomi');assert.equal(generation.args.usage,'home-actions');
  assert.ok(!calls.some(call=>call.command==='download_chat_model'));
  status.runtime.gomiActionApplied=false;
  await assert.rejects(verifyInstalledGomiAction(page,null,{offline:false}),/compact model/);
  delete globalThis.window;
 });
}
