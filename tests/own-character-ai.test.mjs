import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modelUrl} from '../scripts/ts-module-loader.mjs';

const engine=await import(await modelUrl(new URL('../src/features/characters/ownAi/engine.ts',import.meta.url)));
const model=JSON.parse(readFileSync(new URL('../src/features/characters/ownAi/model.json',import.meta.url),'utf8'));
const input={characterId:'gomi',action:'treat',affection:80,mood:'calm',energy:3,sleeping:false,previous:[]};

test('own model has no pretrained parent and weights fit the mobile size budget',()=>{
 assert.equal(model.provenance.initialization,'random');
 assert.deepEqual(model.provenance.pretrainedParents,[]);
 assert.equal(model.provenance.teacherModel,null);
 assert.ok(JSON.stringify(model).length<2_000_000);
 assert.ok(!('replies' in model));
});
test('real learned weights generate bounded Korean for registered actions',()=>{
 const ai=engine.loadOwnModel(model);
 for(const action of ['touch','walk','treat','pet','play','rest']){
  const reply=engine.generateOwnLine(ai,{...input,action},123+action.length);
  assert.match(reply,/[가-힣]/);assert.ok(Array.from(reply).length<=50);
  assert.ok(!/[<>{}]|assistant|system/i.test(reply));
 }
});
test('unregistered actions and corrupt weights fail explicitly',()=>{
 const ai=engine.loadOwnModel(model);
 assert.throws(()=>engine.generateOwnLine(ai,{...input,action:'unregistered'},1),/AI_ACTION_UNTRAINED/);
 assert.throws(()=>engine.loadOwnModel({...model,weights:{}}),/AI_OWN_MODEL_INVALID/);
});
test('generation supports cancellation before any work',()=>{
 const ai=engine.loadOwnModel(model);
 assert.throws(()=>engine.generateOwnLine(ai,input,1,()=>true),/AI_CANCELLED/);
});
test('learned word connections constrain syntax without a whole-reply lookup table',()=>{
 const ai=engine.loadOwnModel(model),ids=new Map(ai.vocab.map((word,index)=>[word,index]));
 const reply=engine.generateOwnLine(ai,{...input,sleeping:true,mood:'sleepy',energy:0},20261828);
 const words=reply.match(/[^\s.!?…]+|[.!?…]/gu)||[];
 for(let i=1;i<words.length;i++){
  // A period may be added after a model-generated EOS; all spoken word edges
  // must otherwise be supported by the training data.
  if(i===words.length-1&&words[i]==='.')continue;
  assert.ok(ai.nextTokens[ids.get(words[i-1])].has(ids.get(words[i])),`${words[i-1]} -> ${words[i]}`);
 }
 assert.doesNotMatch(reply,/쓰다듬|손길|만지/);
});
