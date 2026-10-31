import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../scripts/gomi-training/export-data.mjs';
import { modelUrl } from '../scripts/ts-module-loader.mjs';

test('Gomi training exports production prompts and keeps whole scenarios out of training', async () => {
  const { train, validation, manifest } = await buildDataset();
  const { buildTouchPrompt } = await import(await modelUrl('features/characters/companionTouch.ts'));
  assert.ok(train.length >= 80);
  assert.ok(validation.length >= 15);
  const trainGroups = new Set(train.map(row => row.group));
  const prompts = new Set(train.map(row => row.prompt));
  for (const row of validation) {
    assert.equal(trainGroups.has(row.group), false);
    assert.equal(prompts.has(row.prompt), false);
  }
  for (const row of [...train, ...validation]) {
    if (row.kind === 'interaction') {
      assert.equal(row.prompt, buildTouchPrompt(row.context).replace(/<think>\n\n<\/think>\n\n$/, '').replaceAll('/no_think', ''));
      assert.equal(row.context.definition.id, 'gomi');
    }
    assert.ok(row.prompt.endsWith('<|im_start|>assistant\n'));
    assert.ok(!row.prompt.includes('/no_think') && !row.prompt.includes('<think>'));
    assert.ok(row.reply.length >= 2 && row.reply.length <= 70);
    assert.ok(!/[<>\n]/.test(row.reply));
    assert.ok(!row.prompt.includes(row.reply));
  }
  const interactions = train.filter(row => row.kind === 'interaction');
  assert.deepEqual([...new Set(interactions.map(row => row.context.owned.affection))].sort((a,b)=>a-b), [0,20,30,60,90]);
  assert.ok(interactions.some(row => row.context.memory.mood === 'sleepy'));
  assert.ok(interactions.some(row => row.context.memory.mood === 'irritated'));
  assert.equal(manifest.personalData, false);
  assert.equal(manifest.model, 'Qwen/Qwen3-4B-Instruct-2507');
});

test('user Gomi references preserve exact speech and never invent speech for the sulking behavior', async () => {
  const { train, validation, manifest } = await buildDataset();
  const references = train.filter(row => row.kind === 'persona-reference');
  assert.equal(references.length, 9);
  assert.equal(manifest.verbalReferenceCount, 9);
  assert.deepEqual(manifest.nonverbalReferenceIds, ['scolded']);
  assert.equal(references.find(row => row.referenceId === 'wants-walk').reply, '언제 나가 빨리나가');
  assert.equal(references.find(row => row.referenceId === 'other-animal').reply, '뭐 함 뜨까? 내 주인 뒤에 있는데 뜨까? 해볼텨?');
  assert.ok(![...train, ...validation].some(row => row.referenceId === 'scolded'));
  assert.ok(references.every(row => row.source === 'user-provided'));
  assert.ok(references.every(row => row.prompt.includes('가정한 장면') && row.prompt.includes('이미 일어났다고 주장하지 않는다')));
  const walks = [...train, ...validation].filter(row => row.kind === 'interaction' && row.context.action === 'walk');
  assert.ok(walks.every(row => !/지금은 싫어|한 바퀴만|서두르지 말자|덜 귀찮아/.test(row.reply)));
});

test('Gomi training export is reproducible and targets are unique across splits', async () => {
  assert.deepEqual(await buildDataset(), await buildDataset());
  const { train, validation } = await buildDataset();
  const answers = new Set(train.map(row => row.reply));
  for (const row of validation) assert.equal(answers.has(row.reply), false);
});
