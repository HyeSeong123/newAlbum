import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const affinitySource = ts.transpileModule(readFileSync(new URL('../src/features/characters/gomiAffinity.ts', import.meta.url),'utf8'), { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
const affinityUrl = `data:text/javascript;base64,${Buffer.from(affinitySource).toString('base64')}`;
const affinity = await import(affinityUrl);
const greetingSource = ts.transpileModule(readFileSync(new URL('../src/features/characters/gomiGreeting.ts', import.meta.url),'utf8').replace('"./gomiAffinity"', JSON.stringify(affinityUrl)), { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
const { claimGomiGreeting } = await import(`data:text/javascript;base64,${Buffer.from(greetingSource).toString('base64')}`);
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
test('daily welcomes use six affection tiers and the requested restrained wording', () => {
  for (const [score,tier] of [[0,0],[19,0],[20,1],[29,1],[30,2],[59,2],[60,3],[89,3],[90,4],[99,4],[100,5],[150,5]]) {
    assert.equal(affinity.gomiGreetingTier(score),tier);
  }
  assert.deepEqual([0,20,30,60].map(score=>affinity.gomiDialogueLines(score,'greeting')), [
    ['........누구....?'], ['......왔네....'], ['...자주 오네..'], ['기다리진 않았어...'],
  ]);
  for (const score of [90,100]) assert.ok(affinity.gomiDialogueLines(score,'greeting').length >= 5);
  assert.ok(affinity.gomiDialogueLines(0).includes('....뭐'));
  assert.ok(affinity.gomiDialogueLines(0).includes('....귀찮게 하지마....'));
  assert.equal(gomiSleepLine(3,0),'휴...');
  assert.equal(gomiSleepLine(4,0),'어휴..또 시작이네...');
});
test('daily greeting survives repeat entries and stored restarts, and resets on the local day', () => {
  const values = new Map();
  const storage = { getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value) };
  assert.equal(claimGomiGreeting('2026-10-13','daily-test',0,storage,()=>0),'........누구....?');
  assert.equal(claimGomiGreeting('2026-10-13','daily-test',100,storage),undefined);
  assert.equal(claimGomiGreeting('2026-10-14','daily-test',100,storage,()=>0),'혼자두고 어디다녀왔어');
  values.set('gamjassak:gomi-greeting:stored-test','2026-10-13');
  assert.equal(claimGomiGreeting('2026-10-13','stored-test',90,storage),undefined);
  assert.equal(claimGomiGreeting('2026-10-14','stored-test',90,storage,()=>0),'빨리빨리 다녀');
  const disabled = { getItem:()=>{throw Error('disabled');}, setItem:()=>{throw Error('disabled');} };
  assert.equal(claimGomiGreeting('2026-10-13','disabled-test',20,disabled),'......왔네....');
  assert.equal(claimGomiGreeting('2026-10-13','disabled-test',20,disabled),undefined);
});

test('Gomi has varied everyday and event dialogue at every current personality boundary',()=>{
  for(const affection of [0,20,30,60,90]){
    const idle=affinity.gomiDialogueLines(affection,'idle');
    assert.ok(new Set(idle).size>=16,`affection ${affection} needs more everyday lines`);
    for(const context of ['photoAdded','regionMemory','selectedAsMain','sad']){
      const lines=affinity.gomiDialogueLines(affection,context);
      assert.ok(new Set(lines).size>=4,`${affection}/${context} needs more situation-specific lines`);
      assert.ok(lines.some(line=>!idle.includes(line)));
    }
    idle.splice(0,idle.length,'changed outside the model');
    assert.ok(affinity.gomiDialogueLines(affection,'idle').length>=16);
  }
});
test('sleeping has two different poses and all expressions and motion frames are transparent local PNGs', () => {
  const assets = new Set(Object.values(gomiMotionFrames).flat());
  assert.equal(assets.size, 22);
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
  for (const [roll,pose] of [[0,'idle'],[.1999,'idle'],[.2,'rest-front'],[.3999,'rest-front'],[.4,'sleep-curled'],[.5999,'sleep-curled'],[.6,'sleep-stretched'],[.6999,'sleep-stretched'],[.7,'sleep-warm'],[.8999,'sleep-warm'],[.9,'stretch'],[.9999,'stretch']]) {
    let draws=0;
    assert.equal(gomiHomeMotion('2026-10-01',()=>{draws++;return roll;}),pose);
    assert.equal(draws,1);
  }
});
test('the awake lounging pose keeps its own drawing at every affection level', () => {
  assert.deepEqual(gomiMotionFrames['rest-front'], ['/characters/gomi/rest-front.png']);
  for (const affection of [0,19,20,30,60,90,100]) assert.equal(allowedGomiMotion('rest-front',affection),'rest-front');
  assert.notDeepEqual(gomiMotionFrames['rest-front'],gomiMotionFrames.cynical);
  assert.notDeepEqual(gomiMotionFrames['rest-front'],gomiMotionFrames['sleep-stretched']);
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
  const openings = [[],[],[],[],[]];
  for (const [topic, steps] of Object.entries(affinity.gomiGuideLines)) {
    assert.equal(steps.length,3);
    for (let step=0;step<steps.length;step++) {
      const copies = [0,20,30,60,90].map(score=>affinity.gomiGuideCopy(topic,step,score,'필요한 기능 안내'));
      assert.equal(new Set(copies.map(copy=>copy.line)).size,5,`${topic}:${step}`);
      assert.equal(new Set(copies.map(copy=>copy.detail)).size,5);
      for (const copy of copies) assert.ok(copy.detail.includes('필요한 기능 안내'));
      copies.forEach((copy,tier) => openings[tier].push(copy.detail.replace('필요한 기능 안내','').trim()));
    }
  }
  for (const tier of openings) {
    assert.equal(tier.length,21);
    assert.equal(new Set(tier).size,21,'Each help step needs its own opening, not a shared catchphrase.');
    assert.equal(new Set(tier.map(line=>line.split(/[.!?]/)[0])).size,21,'Vary the first sentence too.');
    assert.ok(tier.every(line=>!line.includes('여기에 적어놨잖아')));
  }
});
