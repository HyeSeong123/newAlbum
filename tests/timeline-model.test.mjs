import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { buildTimeline } = await import(await modelUrl('features/timeline/timelineModel.ts'));
const media = (id,takenAt,fileType='image',extra={}) => ({ id,takenAt,fileType,comment:'',...extra });
test('timeline groups descending years months and days with accurate photo and video counts', () => {
  const items = [media('a','2023-09-27'),media('b','2026-09-18','video'),media('c','2026-09-18T23:00:00+09:00'),media('d','2026-08-12'),media('e','2026-09-27')];
  const result = buildTimeline(items, { '2026-08-12':'여름휴가 · 함께 보낸 하루' });
  assert.deepEqual(result.years.map(year => year.year),['2026','2023']);
  assert.deepEqual(result.years[0].months.map(month => month.month),['2026-09','2026-08']);
  assert.deepEqual(result.years[0].months[0].days.map(day => day.date),['2026-09-27','2026-09-18']);
  const day = result.years[0].months[0].days[1];
  assert.equal(day.photoCount,1); assert.equal(day.videoCount,1); assert.equal(day.cover.id,'c');
  assert.equal(result.years[0].months[1].days[0].summary,'여름휴가 · 함께 보낸 하루');
  assert.equal(items[0].id,'a');
});
test('invalid dates remain discoverable separately and titles precede comment snippets', () => {
  const result = buildTimeline([media('a',null),media('b','2023-02-29'),media('c','2024-02-29','video',{ title:'바다',comment:'기록' })]);
  assert.equal(result.undated.items.length,2);
  assert.equal(result.years[0].months[0].days[0].summary,'바다');
  assert.equal(result.years[0].months[0].days[0].cover.id,'c');
  assert.deepEqual(buildTimeline([]),{ years:[],undated:undefined });
});
