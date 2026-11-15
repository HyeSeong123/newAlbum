import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modelUrl} from '../scripts/ts-module-loader.mjs';

const engine=await import(await modelUrl(new URL('../src/features/characters/ownAi/engine.ts',import.meta.url)));
const model=JSON.parse(readFileSync(new URL('../src/features/characters/ownAi/model.json',import.meta.url),'utf8'));
const input={characterId:'gomi',action:'treat',affection:80,mood:'calm',energy:3,sleeping:false,previous:[]};
const activities=await import(await modelUrl(new URL('../src/features/characters/companionActivities.ts',import.meta.url)));
const definitions=JSON.parse(readFileSync(new URL('../src/features/characters/data/characterDefinitions.json',import.meta.url),'utf8'));

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
test('each plant gift response matches the actual sunlight button, while Gomi receives a snack',()=>{
 const ai=engine.loadOwnModel(model);
 for(const definition of definitions.filter(row=>row.type!=='gomi')){
  assert.equal(activities.companionActionLabel(definition,'treat'),'햇살 선물');
  const reply=engine.generateOwnLine(ai,{...input,characterId:definition.id,mood:'delighted'},20261115);
  assert.match(reply,/햇살|빛|따뜻|포근|선물/);assert.doesNotMatch(reply,/간식|먹을|먹어/);
 }
 assert.doesNotMatch(engine.generateOwnLine(ai,input,20261115),/햇살|햇빛/);
});
test('generation supports cancellation before any work',()=>{
 const ai=engine.loadOwnModel(model);
 assert.throws(()=>engine.generateOwnLine(ai,input,1,()=>true),/AI_CANCELLED/);
});
test('sleeping Gomi keeps producing distinct reactions at low affection after repeated touches',()=>{
 const ai=engine.loadOwnModel(model);
 const previous=['조금 더 잘래. 더 잘래.','자는 동안은 조용히 말해줘.','나 졸리단 말이야. 더 잘래.',
  '조금만 조용히 해줘. 더 잘래.','조금만 더 자게 해줘.','왜 불러? 더 잘래.',
  '나 졸리단 말이야. 나 좀 더 자게 해줘.','조금만 조용히 해줘. 지금은 조용히 해.','나 졸리단 말이야. 조금 더 잘래.'];
 const line=engine.generateOwnLine(ai,{...input,action:'touch',affection:0,mood:'sleepy',energy:1,sleeping:true,previous},20261448);
 assert.ok(!previous.includes(line));assert.match(line,/잘|자게|자고|졸|조용|깨우|쉬/);
 for(const mood of ['sleepy','irritated']){
  const recent=[];
  for(let index=0;index<16;index++){
   const reply=engine.generateOwnLine(ai,{...input,action:'touch',affection:0,mood,energy:1,sleeping:true,previous:recent},20261115+index*37);
   assert.ok(!recent.includes(reply));assert.ok(Array.from(reply).length<=50);
   recent.push(reply);if(recent.length>12)recent.shift();
  }
 }
});
test('learned word connections constrain syntax without a whole-reply lookup table',()=>{
 const ai=engine.loadOwnModel(model),ids=new Map(ai.vocab.map((word,index)=>[word,index]));
 const reply=engine.generateOwnLine(ai,{...input,sleeping:true,mood:'sleepy',energy:0},20261828);
 const words=reply.match(/[^\s.!?…]+|[.!?…]/gu)||[];
 for(let i=1;i<words.length;i++){
  // A period may be added after a model-generated EOS; all spoken word edges
  // must otherwise be supported by the training data.
  if(i===words.length-1&&words[i]==='.')continue;
  if(/^[.!?…]$/.test(words[i-1])){assert.ok(ai.nextTokens[0].has(ids.get(words[i])));continue;}
  assert.ok(ai.nextTokens[ids.get(words[i-1])].has(ids.get(words[i])),`${words[i-1]} -> ${words[i]}`);
 }
 assert.doesNotMatch(reply,/쓰다듬|손길|만지|걱정|추워|아파/);
});
test('the neural generator can compose utterances absent from the training corpus',()=>{
 const corpus=JSON.parse(readFileSync(new URL('../local-ai/own/corpus.json',import.meta.url),'utf8'));
 const normal=text=>text.replace(/[\p{P}\p{S}\s]/gu,'');
 const original=new Set(corpus.rows.map(row=>normal(row.reply))),ai=engine.loadOwnModel(model);
 const outputs=Array.from({length:40},(_,index)=>engine.generateOwnLine(ai,{...input,action:'touch'},20261115+index*37));
 assert.ok(new Set(outputs).size>=5);
 assert.ok(outputs.some(line=>!original.has(normal(line))),'Fresh word generation must allow new full utterance combinations');
});
