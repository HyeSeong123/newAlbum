import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const content=readFileSync(new URL('../src/features/characters/companionResponseMode.ts',import.meta.url),'utf8');
const code=ts.transpileModule(content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('Gomi begins in immediate mode; existing other characters preserve live AI mode',()=>{
  const store={getItem:()=>null,setItem:()=>{}};
  assert.equal(m.readCompanionResponseMode('gomi',store),'instant');
  assert.equal(m.readCompanionResponseMode('potato',store),'generate');
  assert.equal(m.readCompanionResponseMode('sweet-potato',store),'generate');
});

test('per-character choice persists and never modifies other character records',()=>{
  const values=new Map(),store={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  m.saveCompanionResponseMode('gomi','generate',store);
  assert.equal(m.readCompanionResponseMode('gomi',store),'generate');
  assert.equal(m.readCompanionResponseMode('potato',store),'generate');
  m.saveCompanionResponseMode('gomi','instant',store);
  assert.equal(m.readCompanionResponseMode('gomi',store),'instant');
  m.saveCompanionResponseMode('potato','instant',store);
  assert.equal(m.readCompanionResponseMode('potato',store),'instant');
  assert.equal(values.size,2);
});

test('blocked optional storage never delays the response or loses the session choice',()=>{
  const broken={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
  assert.equal(m.readCompanionResponseMode('gomi-no-store',broken),'generate');
  m.saveCompanionResponseMode('gomi-no-store','instant',broken);
  assert.equal(m.readCompanionResponseMode('gomi-no-store',broken),'instant');
});
