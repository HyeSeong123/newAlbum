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
test('normal unbonded Gomi has no spoken scene to accidentally infer',()=>{
 const ai=engine.loadOwnModel(model);
 for(const affection of [0,19,20,29,30,59])for(const action of model.actions)for(const sleeping of [false,true]){
  const state={...input,affection,action,sleeping,energy:1};
  assert.equal(ai.scenes.has(engine.ownSceneKey(state)),false);
  assert.throws(()=>engine.generateOwnLine(ai,state,5),/AI_SCENE_UNTRAINED/);
 }
});

test('sleeping bonded Gomi keeps producing distinct reactions after repeated touches',()=>{
 const ai=engine.loadOwnModel(model);
 const previous=['조금 더 잘래. 더 잘래.','자는 동안은 조용히 말해줘.','나 졸리단 말이야. 더 잘래.',
  '조금만 조용히 해줘. 더 잘래.','조금만 더 자게 해줘.','왜 불러? 더 잘래.',
  '나 졸리단 말이야. 나 좀 더 자게 해줘.','조금만 조용히 해줘. 지금은 조용히 해.','나 졸리단 말이야. 조금 더 잘래.'];
 const line=engine.generateOwnLine(ai,{...input,action:'touch',affection:60,mood:'sleepy',energy:1,sleeping:true,previous},20261448);
 assert.ok(!previous.includes(line));assert.match(line,/잘|자게|자고|졸|조용|깨우|쉬|안 일어날|깨어나면/);
 for(const mood of ['sleepy','irritated']){
  const recent=[];
  for(let index=0;index<16;index++){
   const reply=engine.generateOwnLine(ai,{...input,action:'touch',affection:60,mood,energy:1,sleeping:true,previous:recent},20261115+index*37);
   assert.ok(!recent.includes(reply));assert.ok(Array.from(reply).length<=50);
   recent.push(reply);if(recent.length>12)recent.shift();
  }
 }
});
test('petting keeps one coherent stance instead of stopping and inviting touch together',()=>{
 const ai=engine.loadOwnModel(model);
 const reply=engine.generateOwnLine(ai,{...input,action:'pet',affection:75},20261146);
 assert.match(reply,/쓰다듬|손|만지|살살|멈춰|거기|그만|어색|천천히|기대|옆|가만히/);
 assert.doesNotMatch(reply,/(?:그만|치워|멈춰)[^.!?]*[.!?].*(?:더 쓰다듬어|만져줘|조금만 더)/);
});
test('the reported sleep/food/play hybrid is impossible under the learned scene support',()=>{
 const ai=engine.loadOwnModel(model);
 const state={...input,sleeping:true,mood:'sleepy',energy:1};
 assert.equal(engine.supportsOwnLine(ai,state,'나 졸리단 말이야. 조금만 더 같이 해볼까?'),false);
 assert.notDeepEqual(engine.ownFeatureNames(state),engine.ownFeatureNames({...state,energy:0}));
 assert.ok(engine.ownFeatureNames({...state,energy:0}).includes('energy:exhausted'));
});
test('learned scene connections constrain syntax without a whole-reply lookup table',()=>{
 const ai=engine.loadOwnModel(model);
 const reply=engine.generateOwnLine(ai,{...input,sleeping:true,mood:'sleepy',energy:0},20261828);
 assert.equal(engine.supportsOwnLine(ai,{...input,sleeping:true,mood:'sleepy',energy:0},reply),true);
 assert.doesNotMatch(reply,/쓰다듬|손길|만지|걱정|추워|아파/);
});
test('sleepy food approach and exhausted continued sleep differ at every personality boundary',()=>{
 const ai=engine.loadOwnModel(model);
 for(const action of ['treat','meal'])for(const affection of [60,89,90,100]){
  const recent=[];
  for(let index=0;index<16;index++){
   const state={...input,action,affection,sleeping:true,energy:1,mood:'sleepy',previous:recent};
   const line=engine.generateOwnLine(ai,state,8811+index*31);
   assert.doesNotMatch(line,/놀자|해볼까|차례|시작|산책|햇살|더 자게|계속 잘|나중에 먹|깨면 먹/);
   assert.match(line,/먹|간식|밥|갈게|가고|가서|줘|놓아|기다려/);
   assert.ok(!recent.includes(line));recent.push(line);if(recent.length>12)recent.shift();
   const tired=engine.generateOwnLine(ai,{...state,energy:0,previous:[]},8811+index*31);
   assert.match(tired,/잘|자고|자게|잠|졸|피곤|나중|이따|일어나면|깨면|깬 다음|못 일어나|조금 뒤/);
   assert.doesNotMatch(tired,/먹으러 갈게|지금 먹을래|일어날게|먹자|같이 해볼까|놀자/);
   assert.notEqual(tired,line);
  }
 }
});
test('the neural generator can compose utterances absent from the training corpus',()=>{
 const corpus=JSON.parse(readFileSync(new URL('../local-ai/own/corpus.json',import.meta.url),'utf8'));
 const normal=text=>text.replace(/[\p{P}\p{S}\s]/gu,'');
 const original=new Set(corpus.rows.map(row=>normal(row.reply))),ai=engine.loadOwnModel(model);
 const outputs=[];
 for(const action of ['touch','treat','meal','walk','rest']){
  const previous=[];
  for(let index=0;index<40;index++){
   const line=engine.generateOwnLine(ai,{...input,action,previous},20261115+index*37);
   outputs.push(line);previous.push(line);if(previous.length>12)previous.shift();
  }
 }
 assert.ok(new Set(outputs).size>=5);
 assert.ok(outputs.some(line=>!original.has(normal(line))),'Fresh word generation must allow new full utterance combinations');
});
test('a finite learned scene still generates after its larger recent window is exhausted',()=>{
 const ai=engine.loadOwnModel(model),previous=[];
 for(let index=0;index<24;index++){
  const line=engine.generateOwnLine(ai,{...input,characterId:'potato',action:'touch',previous},771+index*37);
  assert.ok(!previous.slice(-3).includes(line));assert.equal(engine.supportsOwnLine(ai,{...input,characterId:'potato',action:'touch'},line),true);
  previous.push(line);if(previous.length>12)previous.shift();
 }
});
