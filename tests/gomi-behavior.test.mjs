import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/characters/gomiBehavior.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } });
const { allowedGomiMotion, gomiInteractionMotion, gomiSleepMotion, gomiMotionFrames, GOMI_BOND_AFFECTION } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('paw waving and licking remain locked below the bond threshold, including direct visual requests', () => {
  assert.equal(GOMI_BOND_AFFECTION, 20);
  for (const affection of [0,1,19]) {
    for (let click=1; click<=50; click++) assert.equal(gomiInteractionMotion(affection,click), 'happy');
    assert.equal(allowedGomiMotion('paw-wave',affection), 'happy');
    assert.equal(allowedGomiMotion('lick',affection), 'happy');
  }
  for (const affection of [20,21,100]) {
    assert.deepEqual([1,2,3].map(n=>gomiInteractionMotion(affection,n)), ['paw-wave','lick','happy']);
    assert.equal(allowedGomiMotion('paw-wave',affection), 'paw-wave');
    assert.equal(allowedGomiMotion('lick',affection), 'lick');
  }
});
test('sleeping has two different poses and all expressions and motion frames are transparent local PNGs', () => {
  assert.equal(gomiSleepMotion(()=>.7499), 'sleep-curled');
  assert.equal(gomiSleepMotion(()=>.75), 'sleep-stretched');
  assert.equal(gomiSleepMotion(()=>.9999), 'sleep-stretched');
  const assets = new Set(Object.values(gomiMotionFrames).flat());
  assert.equal(assets.size, 9);
  for (const path of assets) {
    const png = readFileSync(new URL(`../public${path}`,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png[25],6,'RGBA preserves the actual transparent background');
  }
  assert.equal(gomiMotionFrames['paw-wave'].length,2);
  assert.notDeepEqual(gomiMotionFrames['sleep-curled'], gomiMotionFrames['sleep-stretched']);
  assert.ok(gomiMotionFrames.stretch.length);
});
