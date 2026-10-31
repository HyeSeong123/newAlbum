import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAdditionalDialogues, buildAdditionalDataset } from '../scripts/gomi-training/export-additional.mjs';
import { buildDataset } from '../scripts/gomi-training/export-data.mjs';

test('additional120 keeps every quote and refuses a missing or duplicate number', async () => {
  const text = await readFile(new URL('../scripts/gomi-training/user-dialogues-120.txt', import.meta.url), 'utf8');
  const data = parseAdditionalDialogues(text);
  assert.equal(data.examples.length, 120);
  assert.equal(data.sections.length, 4);
  assert.equal(data.examples[0].speech, '집사, 나 좀 추운데. 안아줄 생각 없어?');
  assert.equal(data.examples.at(-1).speech, '내일도 여기서 자면 안 되나… 아니, 일단 오늘은 잘게.');
  assert.ok(data.rules.includes('의도적인 보복으로 단정하지 않으며'));
  assert.throws(() => parseAdditionalDialogues(text.replace('30. [집사 옆에서 편안하게 눈을 감음]', '29. [집사 옆에서 편안하게 눈을 감음]')), /incomplete|30/);
  assert.throws(() => parseAdditionalDialogues(text.replace(/^30\. \[집사 옆에서 편안하게 눈을 감음\].*$/mu, '')), /incomplete|30/);
});

test('v4 replays the unchanged345 train and48 evaluation while adding all120 and separate16', async () => {
  const old = await buildDataset();
  const data = await buildAdditionalDataset();
  assert.equal(data.train.length, 465);
  assert.equal(data.validation.length, 64);
  assert.deepEqual(data.train.slice(0, 345), old.train);
  assert.deepEqual(data.validation.slice(0, 48), old.validation);
  assert.equal(data.train.filter(row => row.kind === 'user-dialogue-120').length, 120);
  assert.equal(data.validation.filter(row => row.kind === 'persona-evaluation-v4').length, 16);
  const replies = new Set(data.train.map(row => row.reply));
  const prompts = new Set(data.train.map(row => row.prompt));
  for(const row of [...data.train, ...data.validation]) assert.ok(!row.prompt.includes(row.reply));
  for(const row of data.validation) assert.ok(!replies.has(row.reply) && !prompts.has(row.prompt));
  assert.ok(data.train.filter(row => row.kind === 'user-dialogue-120' && row.section === 1).every(row => row.prompt.includes('솔직한 의존성')));
  assert.ok(data.train.filter(row => row.kind === 'user-dialogue-120' && row.section === 3).every(row => row.prompt.includes('복수로 해석하지')));
});
