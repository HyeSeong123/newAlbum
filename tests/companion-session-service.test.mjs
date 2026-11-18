import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {modelUrl} from '../scripts/ts-module-loader.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class TransportWorker {
 static instances=[];
 constructor(){this.messages=[];TransportWorker.instances.push(this);queueMicrotask(()=>this.onmessage?.({data:{type:'ready',loadMs:1,bytes:220000}}));}
 postMessage(message){this.messages.push(message);}
 reply(id,line){this.onmessage?.({data:{id,type:'reply',line,generationMs:1}});}
 terminate(){this.terminated=true;}
}
test('cancelled work cannot publish into the next own-AI request; tiny weights are reused',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'gomgomi-own-client-'));
 const previous=globalThis.Worker;globalThis.Worker=TransportWorker;
 try{
  const source=await readFile(new URL('../src/features/characters/ownAi/client.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const file=join(temporary,'client.mjs');await writeFile(file,output);
  const client=await import(pathToFileURL(file).href);
  await client.warmOwnAi();await client.warmOwnAi();
  assert.equal(TransportWorker.instances.length,1);
  const worker=TransportWorker.instances[0],input={characterId:'gomi',action:'touch',affection:80,mood:'calm',energy:3};
  const control=new AbortController();
  const first=client.generateOwnReaction(input,control.signal);const cancelled=assert.rejects(first,/AI_CANCELLED/);
  await tick();const oldId=worker.messages.at(-1).id;control.abort();await cancelled;
  const second=client.generateOwnReaction({...input,characterId:'potato'});await tick();
  const newId=worker.messages.at(-1).id;assert.notEqual(oldId,newId);
  worker.reply(oldId,'이 결과는 취소됐어.');worker.reply(newId,'나도 같이 있어줄게.');
  assert.equal(await second,'나도 같이 있어줄게.');
  assert.equal(client.ownAiStatus().lastOutcome,'success');
  assert.equal(client.ownAiStatus().runtime.ownModelApplied,true);
  const stopped=client.generateOwnReaction(input);const stopRejection=assert.rejects(stopped,/AI_CANCELLED/);
  await tick();client.stopOwnAi();await stopRejection;
  assert.equal(client.ownAiStatus().lastOutcome,'cancelled');
 }finally{globalThis.Worker=previous;await rm(temporary,{recursive:true,force:true});}
});

test('legacy external model generation/download are disabled and Home exposes the own model',async()=>{
 const service=await import(await modelUrl(new URL('../src/features/characters/companionChatService.ts',import.meta.url)));
 await assert.rejects(service.generateChatReply('이전 모델 호출'),/AI_ACTIONS_ONLY/);
 await assert.rejects(service.downloadChatModel(),/AI_EXTERNAL_MODELS_DISABLED/);
 assert.equal((await service.chatModelStatus('gomi','home-actions')).model,'own-character-v3');
 assert.equal((await service.chatModelStatus()).supported,false);
});


test('cancelled Home AI reactions no longer appear running or falsely claim navigation',async()=>{
 const service=await import(await modelUrl(new URL('../src/features/characters/companionChatService.ts',import.meta.url)));
 const id='gomi-cancelled-status-test';
 service.markChatReaction(id,'queued');
 assert.equal(service.lastChatReaction(id)?.phase,'queued');
 service.markChatReaction(id,'running');
 assert.equal(service.lastChatReaction(id)?.phase,'running');
 service.markChatReaction(id,'cancelled');
 assert.equal(service.lastChatReaction(id)?.phase,'cancelled');
 assert.equal(service.lastChatReaction(id)?.message,'AI 반응을 멈췄어요.');
});
