import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/characters/gomiBehavior.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } });
const { allowedGomiMotion, gomiInteractionMotion, gomiHomeMotion, gomiSeason, gomiSleepReaction, gomiMotionFrames, gomiMotionDuration, GOMI_BOND_AFFECTION } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
  const assets = new Set(Object.values(gomiMotionFrames).flat());
  assert.equal(assets.size, 20);
  for (const path of assets) {
    const png = readFileSync(new URL(`../public${path}`,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png[25],6,'RGBA preserves the actual transparent background');
  }
  assert.equal(gomiMotionFrames['paw-wave'].length,2);
  assert.notDeepEqual(gomiMotionFrames['sleep-curled'], gomiMotionFrames['sleep-stretched']);
  assert.ok(gomiMotionFrames.stretch.length);
});
test('local calendar months select the correct bedding, including the year boundary', () => {
  const seasons = ['warm','warm','none','none','cool','cool','cool','cool','cool','warm','warm','warm'];
  for(let month=1;month<=12;month++) {
    const date = `2026-${String(month).padStart(2,'0')}-01`;
    assert.equal(gomiSeason(date), seasons[month-1]);
    assert.equal(gomiHomeMotion(date,()=>.8), seasons[month-1] === 'none' ? 'sleep-curled' : `sleep-${seasons[month-1]}`);
  }
  for (const [roll,pose] of [[0,'idle'],[.3999,'idle'],[.4,'sleep-curled'],[.5999,'sleep-curled'],[.6,'sleep-stretched'],[.6999,'sleep-stretched'],[.7,'sleep-warm'],[.8999,'sleep-warm'],[.9,'stretch'],[.9999,'stretch']]) {
    let draws=0;
    assert.equal(gomiHomeMotion('2026-10-01',()=>{draws++;return roll;}),pose);
    assert.equal(draws,1);
  }
});
test('every sleeping pose peeks first and becomes angry after three consecutive touches, regardless of affinity', () => {
  for (const rest of ['sleep-curled','sleep-stretched','sleep-cool','sleep-warm']) {
    for(const touches of [1,2,3,10]) {
      const reaction=gomiSleepReaction(rest,touches);
      assert.equal(reaction,`${rest}-${touches < 3 ? 'peek' : 'angry'}`);
      assert.equal(allowedGomiMotion(reaction,0),reaction);
      assert.equal(allowedGomiMotion(reaction,100),reaction);
      assert.equal(gomiMotionDuration(reaction),touches < 3 ? 1800 : 2600);
      assert.ok(gomiMotionFrames[reaction]);
    }
  }
});
