import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { browserLocationOverview, groupByMonth, browserRegionPage, orderRegionMedia } = await import(await modelUrl('features/map/memoryMapModel.ts'));

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

test('region filters combine type/year, retain year options, sort missing dates last and never mutate input', () => {
  const items = Object.freeze([
    { id: '1', fileType: 'image', regionCode: 'KR-49', takenAt: '2025-08-12' },
    { id: '2', fileType: 'video', regionCode: 'KR-49', takenAt: '2025-08-13' },
    { id: '3', fileType: 'image', regionCode: 'KR-49', takenAt: '2026-08-12' },
    { id: '4', fileType: 'image', regionCode: 'KR-49', takenAt: null },
    { id: '5', fileType: 'image', takenAt: '2025-08-12' },
    { id: '6', fileType: 'audio', regionCode: 'KR-49', takenAt: '2025-08-12' },
  ].map(Object.freeze));
  const filters = { fileType: 'all', year: '', oldest: false };
  assert.deepEqual(browserRegionPage(items,'KR-49',0,filters).items.map(i=>i.id),['3','2','1','4']);
  const page = browserRegionPage(items,'KR-49',0,{ ...filters, fileType: 'video', year: '2025' });
  assert.deepEqual(page.items.map(i=>i.id),['2']);
  assert.deepEqual(page.years,['2026','2025']);
  assert.deepEqual(browserRegionPage(items,'KR-49',0,{...filters,oldest:true}).items.map(i=>i.id),['1','2','3','4']);
  assert.equal(browserRegionPage(items,'KR-49',0,{...filters,year:'2024'}).total,0);
  assert.equal(browserRegionPage(items,'unclassified',0,filters).items[0].id,'5');
  assert.equal(items[0].id,'1');
});

test('region pages have stable numeric tie order and selection uses the same album order', () => {
  const items = Array.from({length:100},(_,i)=>({id:String(i+1), fileType:'image', regionCode:'KR-49', takenAt:'2025-08-12'}));
  const filters = { fileType:'all', year:'', oldest:false };
  const first = browserRegionPage(items,'KR-49',0,filters);
  const second = browserRegionPage(items,'KR-49',48,filters);
  assert.equal(first.total,100); assert.equal(first.items.length,48);
  assert.equal(first.items[0].id,'100'); assert.equal(second.items[0].id,'52');
  assert.deepEqual(orderRegionMedia([items[9],items[1]],true).map(i=>i.id),['2','10']);
  assert.equal(first.items.some(a=>second.items.some(b=>a.id===b.id)),false);
});

test('month grouping retains order and item identity without modifying the input', () => {
  const items = Object.freeze([{ takenAt: '2026-09-01' }, { takenAt: null }, { takenAt: '2026-09-02' }, { takenAt: '2026-08-01' }].map(Object.freeze));
  const groups = groupByMonth(items);
  assert.deepEqual(groups.map(group => group.month), ['2026-09', '날짜 없음', '2026-08']);
  assert.deepEqual(groups[0].items, [items[0], items[2]]);
  assert.strictEqual(groups[0].items[1], items[2]);
  assert.deepEqual(groupByMonth([]), []);
});
