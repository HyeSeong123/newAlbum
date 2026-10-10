import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const {runAI,registerAIWorker}=await import(await modelUrl('features/ai/runtime.ts'));
test('shared runtime serializes models, disposes the previous domain and recovers from failure',async()=>{
 const calls=[];
 registerAIWorker('test-people',()=>calls.push('dispose-person'));
 const a=runAI('test-people',async()=>{calls.push('person');await new Promise(r=>setTimeout(r,10));calls.push('person-done');return 1;});
 const b=runAI('test-pets',async()=>{calls.push('pet');throw new Error('model failure');});
 const c=runAI('test-people',async()=>{calls.push('restart');return 3;});
 const results=await Promise.allSettled([a,b,c]);
 assert.deepEqual(calls,['person','person-done','dispose-person','pet','restart']);
 assert.equal(results[0].value,1);assert.equal(results[1].status,'rejected');assert.equal(results[2].value,3);
});
test('cancelled waiting work cannot acquire a model or block the next task',async()=>{
 const controller=new AbortController();let called=false;
 const waiting=runAI('test-pets',async()=>{called=true;},controller.signal);controller.abort();
 await assert.rejects(waiting,{name:'AbortError'});assert.equal(called,false);
 assert.equal(await runAI('test-people',async()=>42),42);
});
