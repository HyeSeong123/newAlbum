import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/characters/companionBehavior.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
const { companionHomeMotion, companionInteractionMotion, companionMotionForAction, companionMotionAnimation } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const definitions = JSON.parse(readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url), 'utf8'));

test('all sixteen friends have several awake entry motions without changing their definition', () => {
  for (const def of definitions.filter(d => d.type !== 'gomi')) {
    const before = JSON.stringify(def);
    const motions = [0,.25,.5,.75,.999].map(roll => companionHomeMotion(def.personality.signatureAnimation, () => roll));
    assert.ok(new Set(motions).size >= 3, def.id);
    assert.ok(motions.every(m => ['look-around','nod','stretch','sway'].includes(m)), def.id);
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
test('every motion settles without leaving a sideways or stretched body', () => {
  for (const motion of ['idle','look-around','nod','stretch','sway','bounce','walk','treat','pet','play','rest']) {
    const { keyframes, duration } = companionMotionAnimation(motion,'curious-tilt');
    assert.ok(duration > 0 && duration <= 7);
    for (const [key,value] of Object.entries(keyframes)) assert.equal(Array.isArray(value) ? value.at(-1) : value,key.startsWith('scale') ? 1 : 0,`${motion}/${key}`);
  }
});
