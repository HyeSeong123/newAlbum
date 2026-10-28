import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const affinity = moduleUrl(readFileSync(new URL('../src/features/characters/gomiAffinity.ts', import.meta.url), 'utf8'));
const { resolveHelpDialogue } = await import(moduleUrl(readFileSync(new URL('../src/features/help/helpDialogue.ts', import.meta.url), 'utf8').replace("'../characters/gomiAffinity'", JSON.stringify(affinity))));
const { placeGuide } = await import(moduleUrl(readFileSync(new URL('../src/features/help/helpGeometry.ts', import.meta.url), 'utf8')));
const definitions = JSON.parse(readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url), 'utf8'));

test('every character has five distinct voices without changing the functional instruction', () => {
  const instruction = '현재 선택한 사진을 모두 해제해요. 원본은 유지돼요.';
  const firstLines = new Set();
  for (const character of definitions) {
    const copies = [0, 20, 30, 60, 90].map(a => resolveHelpDialogue(character, a, instruction));
    assert.equal(new Set(copies.map(c => c.line)).size, 5, character.type);
    assert.deepEqual(copies.map(c => c.tier), [0, 1, 2, 3, 4]);
    assert.ok(copies.every(c => c.instruction === instruction));
    firstLines.add(copies[0].line);
    for (const [a, tier] of [[19, 0], [29, 1], [59, 2], [89, 3], [100, 4]]) assert.equal(resolveHelpDialogue(character, a, instruction).tier, tier);
  }
  assert.equal(firstLines.size, definitions.length);
});

test('every character varies within one affinity tier while keeping the exact instruction', () => {
  const instruction='선택한 사진을 저장해요. 원본은 유지돼요.';
  for(const character of definitions)for(const affection of [0,20,30,60,90]){
    const copies=Array.from({length:6},(_,variation)=>resolveHelpDialogue(character,affection,instruction,{stepId:'save',variation}));
    assert.ok(new Set(copies.map(copy=>copy.line)).size>=3,`${character.type}, ${affection}: help must have at least three variants`);
    assert.ok(copies.every(copy=>copy.instruction===instruction));
    for(let i=1;i<copies.length;i++)assert.notEqual(copies[i].line,copies[i-1].line);
  }
});

test('help copy is stable for a step and avoids the preceding line', () => {
  const gomi=definitions.find(character=>character.type==='gomi');
  for(const affection of [0,20,30,60,90])for(const stepId of ['save','delete','select','memory-map','refresh-pet']){
    const options={stepId,variation:3};
    const first=resolveHelpDialogue(gomi,affection,'기능 설명',options);
    assert.deepEqual(resolveHelpDialogue(gomi,affection,'기능 설명',options),first);
    assert.notEqual(resolveHelpDialogue(gomi,affection,'기능 설명',{...options,previousLine:first.line}).line,first.line);
  }
});

test('guide fits small, landscape and offset viewports without covering the target', () => {
  for (const viewport of [{ x: 0, y: 0, width: 320, height: 568 }, { x: 0, y: 0, width: 640, height: 360 }, { x: 0, y: 100, width: 393, height: 420 }, { x: 0, y: 0, width: 1440, height: 1000 }]) {
    for (const y of [viewport.y + 12, viewport.y + viewport.height / 2, viewport.y + viewport.height - 62]) {
      const target = { x: 12, y, width: Math.min(280, viewport.width - 24), height: 44 };
      const p = placeGuide(target, { width: Math.min(340, viewport.width - 20), height: 280 }, viewport);
      assert.ok(p.x >= viewport.x && p.y >= viewport.y);
      assert.ok(p.x + p.width <= viewport.x + viewport.width);
      assert.ok(p.y + p.height <= viewport.y + viewport.height);
      assert.ok(p.x >= target.x + target.width || p.x + p.width <= target.x || p.y >= target.y + target.height || p.y + p.height <= target.y);
      assert.ok(p.width >= 280 && p.height >= 100);
    }
  }
});

test('a target outside the viewport after rotation never places the guide outside it', () => {
  const viewport = { x: 0, y: 0, width: 320, height: 360 };
  for (const target of [{ x: 12, y: 900, width: 280, height: 44 }, { x: -400, y: -90, width: 100, height: 44 }]) {
    const p = placeGuide(target, { width: 300, height: 250 }, viewport);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= 320 && p.y + p.height <= 360);
  }
});
