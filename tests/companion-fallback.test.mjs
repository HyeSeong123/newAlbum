import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
const file=new URL('../src/features/characters/companionFallback.ts',import.meta.url);
test('Home has recent-five fallback selection',()=>assert.ok(existsSync(file)));
if(existsSync(file)){
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 test('fallback excludes the last five and reuses the oldest only when every candidate was used',()=>{
  const values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const pool=['처음 인사','두 번째 인사','세 번째 인사'];
  assert.deepEqual(Array.from({length:5},()=>m.chooseCompanionFallback('small',pool,store)),['처음 인사','두 번째 인사','세 번째 인사','처음 인사','두 번째 인사']);
  const six=['하나야','둘이야','셋이야','넷이야','다섯이야','여섯이야'];
  assert.deepEqual(Array.from({length:7},()=>m.chooseCompanionFallback('six',six,store)),[...six,'하나야']);
  assert.equal(m.chooseCompanionFallback('other',six,store),'하나야');
 });
 test('sleeping Gomi and every action have enough appropriate lines at every affection tier',()=>{
  for(const affection of [0,20,30,60,90])for(const action of ['touch','walk','treat','pet','play','rest'])for(const sleeping of [false,true]){
   const candidates=m.companionFallbackCandidates({gomi:true,affection,action,sleeping,disturbed:sleeping&&action!=='rest',basis:'기존 반응',touchLines:['…','……']});
   const id=`${affection}:${action}:${sleeping}`;
   const lines=Array.from({length:6},()=>m.chooseCompanionFallback(id,candidates,undefined));
   assert.equal(new Set(lines).size,6,id);
   assert.ok(lines.every(line=>/[가-힣]/u.test(line)),id);
   if(sleeping&&action!=='rest')assert.ok(lines.every(line=>!line.includes('산책하자')&&!line.includes('놀자')),id);
  }
 });
 test('corrupt or unavailable optional storage never blocks immediate reactions',()=>{
  const store={getItem:()=>'{bad',setItem:()=>{throw Error('quota');}};
  assert.equal(m.chooseCompanionFallback('broken',['잘 왔어.','반가워.'],store),'잘 왔어.');
  assert.equal(m.chooseCompanionFallback('broken',['잘 왔어.','반가워.'],store),'반가워.');
 });
}
