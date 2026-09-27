import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { browserLocationOverview, groupByMonth } = await import(await modelUrl('features/map/memoryMapModel.ts'));

test('browser counts photos and videos in one pass, excluding audio and retaining empty provinces', () => {
  const names = { 'KR-11': '서울특별시', 'KR-49': '제주특별자치도', 'KR-30': '대전광역시' };
  const items = [
    { fileType: 'image', regionCode: 'KR-11' }, { fileType: 'video', regionCode: 'KR-11' },
    { fileType: 'image', regionCode: 'KR-49' }, { fileType: 'audio', regionCode: 'KR-11' },
    { fileType: 'image' }, { fileType: 'video', regionCode: 'unknown' },
  ].map(Object.freeze);
  const overview = browserLocationOverview(items, names);
  assert.equal(overview.total, 5);
  assert.equal(overview.unclassified, 2);
  assert.deepEqual(overview.regions.map(({ photos, videos }) => [photos, videos]), [[1, 1], [1, 0], [0, 0]]);
  // The same number of records may have new regions after an update.
  assert.equal(browserLocationOverview(items.map(item => ({ ...item, regionCode: 'KR-49' })), names).regions[1].photos, 3);
  assert.equal(browserLocationOverview([], names).total, 0);
});

test('month grouping retains order and item identity without modifying the input', () => {
  const items = Object.freeze([{ takenAt: '2026-09-01' }, { takenAt: null }, { takenAt: '2026-09-02' }, { takenAt: '2026-08-01' }].map(Object.freeze));
  const groups = groupByMonth(items);
  assert.deepEqual(groups.map(group => group.month), ['2026-09', '날짜 없음', '2026-08']);
  assert.deepEqual(groups[0].items, [items[0], items[2]]);
  assert.strictEqual(groups[0].items[1], items[2]);
  assert.deepEqual(groupByMonth([]), []);
});
