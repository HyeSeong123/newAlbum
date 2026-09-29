import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const { appendDiaryPhotos, validateDiary, diaryDateLabel } = await import(await modelUrl('features/diary/diaryModel.ts'));
const photo = id => ({ id, file_path: `${id}.jpg` });
const entry = { id: 1, date: '2026-09-28', title: '하루', body: '', mood: '평온', weather: '맑음', album_id: null };
test('six photos are allowed, duplicates preserve order and seventh fails without changing the draft', () => {
  const current = [photo(1), photo(2)];
  const result = appendDiaryPhotos(current, [photo(2), photo(3), photo(4), photo(5), photo(6)]);
  assert.deepEqual(result.map(p => p.id), [1,2,3,4,5,6]);
  assert.throws(() => appendDiaryPhotos(result, [photo(7)]), /6장/);
  assert.equal(current.length, 2);
  assert.equal(result.length, 6);
  assert.doesNotThrow(() => validateDiary({ ...entry, photos: result }));
});
test('legacy text diaries stay valid and invalid dates or attachments are rejected', () => {
  assert.doesNotThrow(() => validateDiary(entry));
  assert.throws(() => validateDiary({ ...entry, date: '2026-02-30' }));
  assert.throws(() => validateDiary({ ...entry, title: '   ' }));
  assert.throws(() => validateDiary({ ...entry, photos: [photo(1),photo('1')] }));
  assert.equal(diaryDateLabel('2026-09-28'), '09.28 월요일');
});
