import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Inline the small, pure choreography module so native Node tests can import
// TS sources without adding a build tool or changing the release pipeline.
const options = { compilerOptions: { target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } };
const brotherSource = readFileSync(new URL('../src/features/characters/brothersMotion.ts', import.meta.url), 'utf8');
const brotherCode = ts.transpileModule(brotherSource, options).outputText;
const brotherUrl = `data:text/javascript;base64,${Buffer.from(brotherCode).toString('base64')}`;
const { brotherMotionAnimation, brotherEffectForMotion } = await import(brotherUrl);
const source = readFileSync(new URL('../src/features/characters/companionBehavior.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, options).outputText.replace('from "./brothersMotion"', `from "${brotherUrl}"`);
const { companionHomeMotion, companionInteractionMotion, companionMotionForAction, companionMotionAnimation, companionMotionStillFrame } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const definitions = JSON.parse(readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url), 'utf8'));

test('all sixteen friends have several awake entry motions without changing their definition', () => {
  for (const def of definitions.filter(d => d.type !== 'gomi')) {
    const before = JSON.stringify(def);
    const motions = [0,.25,.5,.75,.999].map(roll => companionHomeMotion(def.personality.signatureAnimation, () => roll));
    assert.ok(new Set(motions).size >= 3, def.id);
    assert.ok(motions.every(m => ['look-around','nod','stretch','sway'].includes(m)), def.id);
    const history = [];
    for (let visit = 0; visit < 8; visit++) {
      const pose = companionHomeMotion(def.personality.signatureAnimation, () => 0, history);
      assert.ok(!history.includes(pose), `${def.id} repeated a recent home pose`);
      history.push(pose);
      if (history.length > 3) history.shift();
    }
    assert.equal(JSON.stringify(def), before);
  }
});
test('repeated touches vary and a resting friend reacts quietly', () => {
  for (const def of definitions.filter(d => d.type !== 'gomi')) {
    const signature = def.personality.signatureAnimation;
    const motions = [1,2,3,4].map(n => companionInteractionMotion(signature,n,false));
    assert.ok(new Set(motions).size >= 3, def.id);
    for (let i=1;i<motions.length;i++) assert.notEqual(motions[i-1],motions[i]);
    assert.equal(companionInteractionMotion(signature,1,true),'nod');
  }
});
test('each together action gets its own motion and rest loops gently', () => {
  const actions = ['walk','treat','pet','play','rest'];
  assert.deepEqual(actions.map(companionMotionForAction),actions);
  const plans = actions.map(action => companionMotionAnimation(companionMotionForAction(action),'soft-bounce'));
  assert.equal(new Set(plans.map(p => JSON.stringify(p.keyframes))).size,5);
  assert.equal(plans[4].repeat,Infinity);
  assert.ok(plans.slice(0,4).every(p => p.repeat === 0));
});
test('reserved and lively personalities keep visibly different reaction strength', () => {
  const shy = companionMotionAnimation('bounce','shy-peek');
  const lively = companionMotionAnimation('bounce','playful-wiggle');
  assert.ok(Math.min(...lively.keyframes.y) < Math.min(...shy.keyframes.y));
  assert.ok(lively.duration > 0);
});
test('home poses stay visually distinct, loop, and keep their silhouette in reduced-motion mode', () => {
  const poses = ['look-around','nod','stretch','sway'];
  const snapshots = poses.map(pose => companionMotionStillFrame(pose,'soft-bounce'));
  assert.equal(new Set(snapshots.map(frame => JSON.stringify(frame))).size,4);
  for (const pose of poses) {
    assert.equal(companionMotionAnimation(pose,'soft-bounce').repeat,Infinity);
    assert.ok(Object.values(snapshots[poses.indexOf(pose)]).some((value,index) => value !== (index < 3 ? 0 : 1)));
  }
});
test('temporary actions end without leaving a sideways or stretched body', () => {
  for (const motion of ['idle','bounce','walk','treat','pet','play']) {
    const { keyframes, duration } = companionMotionAnimation(motion,'curious-tilt');
    assert.ok(duration > 0 && duration <= 7);
    for (const [key,value] of Object.entries(keyframes)) assert.equal(Array.isArray(value) ? value.at(-1) : value,key.startsWith('scale') ? 1 : 0,`${motion}/${key}`);
  }
});

test('potato and sweet-potato have character-specific movement paths for all five buttons', () => {
  const motions = ['walk','treat','pet','play','rest'];
  for (const signature of ['bashful-peek','brother-wink']) {
    const plans = motions.map(motion => companionMotionAnimation(motion,signature));
    assert.equal(new Set(plans.map(({keyframes}) => JSON.stringify(keyframes))).size,5);
    assert.deepEqual(plans[4],brotherMotionAnimation('rest',signature));
    assert.equal(plans[4].repeat,Infinity);
    for (const plan of plans.slice(0,4)) {
      const dx = Array.isArray(plan.keyframes.x) ? plan.keyframes.x : [plan.keyframes.x];
      const dy = Array.isArray(plan.keyframes.y) ? plan.keyframes.y : [plan.keyframes.y];
      assert.ok(Math.max(...dx)-Math.min(...dx) > 10 || Math.max(...dy)-Math.min(...dy) > 10,signature);
      assert.equal(plan.keyframes.scaleX,1);
      assert.equal(plan.keyframes.scaleY,1);
      assert.equal(plan.repeat,0);
    }
    const touches = [1,2,3,4].map(n => companionInteractionMotion(signature,n));
    assert.equal(new Set(touches).size,4);
    assert.equal(companionInteractionMotion(signature,5),touches[0]);
  }
  assert.notDeepEqual(companionMotionAnimation('walk','bashful-peek'),companionMotionAnimation('walk','brother-wink'));
  assert.equal(brotherEffectForMotion('walk'),'steps');
  assert.equal(brotherEffectForMotion('treat'),'shine');
  assert.equal(brotherEffectForMotion('pet'),'heart');
  assert.equal(brotherEffectForMotion('play'),'stars');
  assert.equal(brotherEffectForMotion('rest'),'sleep');
});

test('brother home silhouettes persist and reduced motion has a meaningful static pose', () => {
  for (const signature of ['bashful-peek','brother-wink']) {
    const poses=['look-around','nod','stretch','sway'];
    const frames = poses.map(motion=>companionMotionStillFrame(motion,signature));
    assert.equal(new Set(frames.map(f=>JSON.stringify(f))).size,4);
    assert.ok(poses.every(motion=>companionMotionAnimation(motion,signature).repeat===Infinity));
    for(const frame of frames) assert.ok(frame.x !== 0 || frame.y !== 0 || frame.rotate !== 0);
  }
});
