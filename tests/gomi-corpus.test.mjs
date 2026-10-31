import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseUserDialogues } from '../scripts/gomi-training/import-dialogues.mjs';
import { buildDataset } from '../scripts/gomi-training/export-data.mjs';

test('parses all 240 supplied quotes verbatim into six complete topics', async () => {
  const text = await readFile(new URL('../scripts/gomi-training/user-dialogues-240.txt', import.meta.url), 'utf8');
  const corpus = parseUserDialogues(text);
  assert.equal(corpus.examples.length, 240);
  assert.equal(corpus.sections.length, 6);
  assert.ok(corpus.sections.every(section => corpus.examples.filter(row => row.section === section.number).length === 40));
  assert.equal(corpus.examples[0].speech, '난 신발 앞에 와 있는데, 넌 아직 옷 고르는 중이야?');
  assert.equal(corpus.examples.at(-1).speech, '내일도 내가 부르면 바로 와. 기다리는 거 싫으니까.');
  assert.ok(corpus.rules.includes('이를 자동으로 두려움이나 숨는 행동으로 해석하지 않는다.'));
  assert.throws(() => parseUserDialogues(text.replace(/^40\. \[다음 산책.*$/mu, '')), /40|incomplete/);
});

test('v3 trains on all supplied quotes and holds out separately authored evaluation', async () => {
  const { train, validation, manifest } = await buildDataset();
  const source = train.filter(row => row.kind === 'user-dialogue-240');
  assert.equal(source.length, 240);
  assert.equal(train.length, 345);
  assert.equal(validation.length, 48);
  assert.equal(manifest.additionalUserDialogueCount, 240);
  assert.ok(source.every(row => row.source === 'user-provided' && row.prompt.includes(row.situation)));
  const answers = new Set(train.map(row => row.reply));
  const prompts = new Set(train.map(row => row.prompt));
  assert.ok(validation.every(row => !answers.has(row.reply) && !prompts.has(row.prompt)));
  assert.ok(validation.filter(row => row.kind === 'persona-evaluation').length === 24);
});
