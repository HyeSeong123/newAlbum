import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { memoryGroups } = await import(await modelUrl('features/memories/memoriesModel.ts'));
const { recordDate } = await import(await modelUrl('features/media/recordDate.ts'));
const photo = (id,takenAt,fileType='image') => ({ id,takenAt,fileType });
test('memory providers group only previous years and month includes different days', () => {
  const items = [photo('a','2023-09-27'),photo('b','2023-09-18','video'),photo('c','2025-09-27T23:00:00+09:00'),photo('d','2026-09-27'),photo('e','2027-09-27'),photo('f',null),photo('g','2023-08-27'),photo('h','2023-09-31')];
  const before = [...items];
  const today = memoryGroups(items,'2026-09-27','today');
  assert.deepEqual(today.map(g => g.title), ['1년 전 오늘','3년 전 오늘']);
  assert.deepEqual(today.flatMap(g => g.items.map(i => i.id)), ['c','a']);
  const month = memoryGroups(items,'2026-09-27','month');
  assert.deepEqual(month[1].items.map(i => i.id), ['a','b']);
  assert.equal(month[1].dateLabel,'2023년 9월');
  assert.deepEqual(items,before);
});
test('record dates validate leap days without shifting timezone or inventing dates', () => {
  assert.equal(recordDate('2024-02-29T23:30:00-10:00'),'2024-02-29');
  assert.equal(recordDate('2000-02-29'),'2000-02-29');
  for (const value of [null,'','1900-02-29','2023-02-29','2025-04-31','2025-00-01','2025-13-01','2025-01-00','0000-01-01','2025-01-01junk']) assert.equal(recordDate(value),null);
  assert.equal(memoryGroups([photo('leap','2024-02-29')],'2028-02-29','today')[0].title,'4년 전 오늘');
  assert.deepEqual(memoryGroups([photo('a','2023-09-27')],'invalid','month'),[]);
});
