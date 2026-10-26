import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/characters/companionBehavior.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
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
