import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/characters/brothersArt.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
const { brotherArtFrame, brotherArtViewBox } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('rest actually selects the sleeping drawing and sadness keeps the sad face', () => {
  for (const id of ['potato','sweet-potato']) {
    assert.equal(brotherArtFrame(id,'rest','idle',0,false),11);
    assert.equal(brotherArtFrame(id,'idle','sad',0,false),4);
    assert.equal(brotherArtFrame(id,'rest','sad',9_000,false),4);
  }
});

test('a greeting changes arm drawings while reduced motion holds the first pose', () => {
  for (const id of ['potato','sweet-potato']) {
    assert.equal(brotherArtFrame(id,'walk','idle',0,false),8);
    assert.equal(brotherArtFrame(id,'walk','idle',320,false),9);
    assert.equal(brotherArtFrame(id,'walk','idle',640,false),8);
    assert.equal(brotherArtFrame(id,'walk','idle',320,true),8);
  }
});

test('the brothers react differently to play and a pet', () => {
  assert.equal(brotherArtFrame('potato','play','idle',0,false),3);
  assert.equal(brotherArtFrame('sweet-potato','play','idle',0,false),6);
  assert.equal(brotherArtFrame('potato','pet','idle',0,false),2);
  assert.equal(brotherArtFrame('sweet-potato','pet','idle',0,false),7);
});

test('idle blinks briefly without closing eyes through a whole idle cycle', () => {
  assert.equal(brotherArtFrame('potato','idle','idle',0,false),0);
  assert.equal(brotherArtFrame('potato','idle','idle',4_500,false),1);
  assert.equal(brotherArtFrame('potato','idle','idle',4_800,false),0);
  assert.equal(brotherArtFrame('potato','idle','idle',4_500,true),0);
});

test('every supported interaction stays within the atlas for bad and extreme elapsed values', () => {
  for (const id of ['potato','sweet-potato']) for (const motion of ['idle','look-around','nod','stretch','sway','bounce','walk','treat','pet','play','rest']) {
    for (const ms of [-1,0,160,320,1e9,NaN,Infinity]) {
      const frame=brotherArtFrame(id,motion,'idle',ms,false);
      assert.ok(Number.isInteger(frame) && frame>=0 && frame<12,`${id}/${motion}/${ms}: ${frame}`);
    }
  }
});

test('viewBox cropping uses the correct cell and clamps invalid indices', () => {
  assert.equal(brotherArtViewBox(0,1448,1086),'0 0 362 362');
  assert.equal(brotherArtViewBox(5,1448,1086),'362 362 362 362');
  assert.equal(brotherArtViewBox(11,1448,1086),'1086 724 362 362');
  assert.equal(brotherArtViewBox(99,1448,1086),'1086 724 362 362');
  assert.equal(brotherArtViewBox(-1,1448,1086),'0 0 362 362');
  assert.equal(brotherArtViewBox(NaN,1448,1086),'0 0 362 362');
});
