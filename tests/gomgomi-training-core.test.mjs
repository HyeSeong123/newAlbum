
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry, validateCorpus } from '../scripts/gomgomi-training/core.mjs';

const definitions = [{ id: 'gomi', defaultName: '고미', personality: { archetype: '도도한 공주', speechTone: '내가 정할게.' } }];
const row = (overrides = {}) => ({ id: 'a', characterId: 'gomi', group: 'walk-a', source: 'user-provided', prompt: '산책 버튼을 눌렀다.', reply: '준비됐으면 나가자.', ...overrides });
const corpus = () => ({ train: [row()], validation: [row({ id: 'b', group: 'rest-b', prompt: '쉬기 버튼을 눌렀다.', reply: '옆자리 비워 둬.' })] });

test('reports an unassigned character instead of inventing one', () => {
  const registry = buildRegistry(definitions, 2);
  assert.equal(registry.registeredCount, 1);
  assert.equal(registry.pendingCount, 1);
  assert.equal(registry.characters.length, 1);
  assert.equal(registry.characters[0].id, 'gomi');
  assert.equal(registry.characters[0].name, '고미');
});
test('rejects duplicate character ids and a target smaller than the actual roster', () => {
  assert.throws(() => buildRegistry([...definitions, ...definitions], 2), /duplicate character/i);
  assert.throws(() => buildRegistry(definitions, 0), /target/i);
});
test('validates both splits without mutating the input', () => {
  const input = corpus(), before = JSON.stringify(input);
  const report = validateCorpus(input, ['gomi']);
  assert.equal(report.valid, true);
  assert.equal(report.trainCount, 1);
  assert.equal(report.validationCount, 1);
  assert.equal(JSON.stringify(input), before);
});
test('rejects an unregistered character', () => {
  const input = corpus(); input.train[0].characterId = 'invented';
  assert.throws(() => validateCorpus(input, ['gomi']), /unknown character/i);
});
test('rejects missing provenance and an empty reply', () => {
  for (const overrides of [{ source: '' }, { reply: '  ' }, { group: '' }, { id: '' }, { prompt: '' }]) {
    const input = corpus(); input.train[0] = row(overrides);
    assert.throws(() => validateCorpus(input, ['gomi']), /required/i);
  }
});
test('rejects globally repeated example ids', () => {
  const input = corpus(); input.validation[0].id = 'a';
  assert.throws(() => validateCorpus(input, ['gomi']), /duplicate example/i);
});
test('rejects scenario group leakage between splits', () => {
  const input = corpus(); input.validation[0].group = 'walk-a';
  assert.throws(() => validateCorpus(input, ['gomi']), /split overlap: group/i);
});
test('rejects normalized prompt and reply leakage between splits', () => {
  for (const key of ['prompt', 'reply']) {
    const input = corpus(); input.validation[0][key] = ' ' + input.train[0][key].replaceAll(' ', '\t') + ' ';
    assert.throws(() => validateCorpus(input, ['gomi']), new RegExp('split overlap: ' + key, 'i'));
  }
});
test('allows two characters to use the same scenario group in different splits', () => {
  const input = corpus(); input.validation[0] = row({ id: 'b', characterId: 'potato' });
  assert.equal(validateCorpus(input, ['gomi', 'potato']).valid, true);
});
test('rejects empty and malformed splits', () => {
  assert.throws(() => validateCorpus({ train: [], validation: [] }, ['gomi']), /empty split/i);
  assert.throws(() => validateCorpus({ train: null, validation: [] }, ['gomi']), /split/i);
});
