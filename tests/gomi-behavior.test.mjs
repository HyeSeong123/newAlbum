import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const affinitySource = ts.transpileModule(readFileSync(new URL('../src/features/characters/gomiAffinity.ts', import.meta.url),'utf8'), { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
const affinityUrl = `data:text/javascript;base64,${Buffer.from(affinitySource).toString('base64')}`;
const affinity = await import(affinityUrl);
const source = readFileSync(new URL('../src/features/characters/gomiBehavior.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replace('"./gomiAffinity"', JSON.stringify(affinityUrl)), { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } });
const { allowedGomiMotion, gomiInteractionMotion, gomiHomeMotion, gomiSeason, gomiSleepReaction, gomiMotionFrames, gomiMotionDuration, GOMI_BOND_AFFECTION, GOMI_LICK_AFFECTION, gomiSleepLine } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Gomi stays cynical until 60, offers a paw at 60 and only licks from 90', () => {
  assert.equal(GOMI_BOND_AFFECTION, 60); assert.equal(GOMI_LICK_AFFECTION, 90);
  for (const affection of [0,19,20,29,30,59]) {
    for (let click=1; click<=50; click++) assert.equal(gomiInteractionMotion(affection,click), 'cynical');
    for (const motion of ['idle','happy','paw-wave','lick']) assert.equal(allowedGomiMotion(motion,affection),'cynical');
  }
  for (const affection of [60,89]) {
    assert.deepEqual([1,2,3].map(n=>gomiInteractionMotion(affection,n)), ['cynical','happy','paw-wave']);
    assert.equal(allowedGomiMotion('paw-wave',affection), 'paw-wave');
    assert.equal(allowedGomiMotion('lick',affection), 'cynical');
  }
  for (const affection of [90,100]) {
    assert.deepEqual([1,2,3,4].map(n=>gomiInteractionMotion(affection,n)), ['paw-wave','lick','happy','cynical']);
    assert.equal(allowedGomiMotion('lick',affection), 'lick');
  }
});
test('sleeping has two different poses and all expressions and motion frames are transparent local PNGs', () => {
  const assets = new Set(Object.values(gomiMotionFrames).flat());
  assert.equal(assets.size, 21);
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

test('20, 30, 60 and 90 boundaries change every dialogue context, description and sleep response', () => {
  const boundaries = [[-1,0],[0,0],[19,0],[20,1],[29,1],[30,2],[59,2],[60,3],[89,3],[90,4],[150,4]];
  for (const [score,tier] of boundaries) assert.equal(affinity.gomiAffinity(score),tier);
  assert.equal(new Set(affinity.gomiDescriptions).size,5);
  for (const context of ['idle','highAffection','greeting','photoAdded','regionMemory','selectedAsMain','sad','growth']) {
    const pools = [0,20,30,60,90].map(score=>affinity.gomiDialogueLines(score,context));
    assert.equal(new Set(pools.map(pool=>pool.join('|'))).size,5,context);
    for (const pool of pools) assert.equal(new Set(pool).size,pool.length);
  }
  for (const touches of [1,2,3,4]) assert.equal(new Set([0,20,30,60,90].map(score=>gomiSleepLine(touches,score))).size,5);
});
test('every help topic and step has distinct usable copy across all five tiers', () => {
  for (const [topic, steps] of Object.entries(affinity.gomiGuideLines)) {
    assert.equal(steps.length,3);
    for (let step=0;step<steps.length;step++) {
      const copies = [0,20,30,60,90].map(score=>affinity.gomiGuideCopy(topic,step,score,'필요한 기능 안내'));
      assert.equal(new Set(copies.map(copy=>copy.line)).size,5,`${topic}:${step}`);
      assert.equal(new Set(copies.map(copy=>copy.detail)).size,5);
      for (const copy of copies) assert.ok(copy.detail.includes('필요한 기능 안내'));
    }
  }
});
