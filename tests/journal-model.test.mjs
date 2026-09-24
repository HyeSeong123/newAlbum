import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the project's compiler so this suite also runs on Node versions without TS stripping.
const source = await readFile(new URL('../src/features/media/journalModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const {
  albumPhotoRatio, arrangeJournalItems, filterJournalMonth, formatJournalDate, journalMonths,
  journalMonthTitle, makeAlbumSpreads, isPortraitMedia, mediaSummary, resolveJournalMonth, shuffleAlbumItems, syncAlbumMedia,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const photo = (id, takenAt, extra = {}) => ({ id, takenAt, fileType: 'image', ...extra });
const records = [photo('may', '2026-05-12'), photo('sep', '2026-09-12'), photo('unknown', null), photo('last-year', '2025-09-12')];

test('initial month, active rail and title describe the same collection', () => {
  const month = resolveJournalMonth(null, records);
  assert.equal(month, '2026-09');
  assert.equal(journalMonthTitle(month), '2026년 9월');
  assert.deepEqual(filterJournalMonth(records, month).map((item) => item.id), ['sep']);
  assert.deepEqual(journalMonths(records), ['2026-09', '2026-05', '2025-09']);
});

test('all records and undated records remain reachable after choosing a month', () => {
  assert.deepEqual(filterJournalMonth(records, 'all'), records);
  assert.deepEqual(filterJournalMonth(records, 'undated').map((item) => item.id), ['unknown']);
  assert.equal(resolveJournalMonth(null, [photo('unknown', null)]), 'undated');
  assert.equal(resolveJournalMonth(null, []), 'all');
});

test('removing the active month falls back to an existing month', () => {
  const remaining = records.filter((item) => item.id !== 'sep');
  assert.equal(resolveJournalMonth('2026-09', remaining), '2026-05');
  assert.equal(resolveJournalMonth('all', remaining), 'all');
});

test('a search with no matches in a chosen month stays empty, without a misleading fallback', () => {
  const month = resolveJournalMonth('2026-09', records);
  assert.deepEqual(filterJournalMonth([records[0]], month), []);
});

test('journal date follows local calendar weekdays and counts each media type', () => {
  assert.equal(formatJournalDate('2026-09-12', false), '9월 12일, 토요일');
  assert.equal(formatJournalDate(null), '날짜 없음');
  assert.equal(mediaSummary([photo('a', null), photo('b', null, { fileType: 'video' }), photo('c', null, { fileType: 'audio' })]), '사진 1장 · 영상 1개 · 음원 1개');
  assert.equal(mediaSummary([]), '기록 없음');
});

test('editorial hero prefers a landscape photo without losing or changing the original order', () => {
  const source = [photo('portrait', null, { width: 600, height: 900 }), photo('video', null, { fileType: 'video', width: 900, height: 600 }), photo('landscape', null, { width: 900, height: 600 })];
  assert.deepEqual(arrangeJournalItems(source).map((item) => item.id), ['landscape', 'portrait', 'video']);
  assert.deepEqual(source.map((item) => item.id), ['portrait', 'video', 'landscape']);
});

test('opening an album preserves saved order, including a partly filled last spread', () => {
  const source = Array.from({ length: 9 }, (_, index) => photo(String(index + 1), null));
  const pages = makeAlbumSpreads(source, 1234);
  assert.ok(pages.every(({ left, right }) => left.length + right.length >= 1 && left.length + right.length <= 3));
  assert.deepEqual(pages.flatMap(({ left, right }) => [...left, ...right]), source);
  assert.deepEqual(makeAlbumSpreads(source, 1234), pages);
  assert.deepEqual(makeAlbumSpreads([]), []);
});

test('explicit shuffle does not mutate saved items or lose duplicate-looking photos', () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const shuffled = shuffleAlbumItems(source, () => 0);
  assert.notDeepEqual(shuffled, source);
  assert.deepEqual([...shuffled].sort(), source);
  assert.deepEqual(source, ['a', 'b', 'c', 'd', 'e']);
});

test('portrait photos own a leaf and mixed orientations retain their saved order', () => {
  const dimensions = [[600, 900], [900, 600], [900, 600], [900, 600], [600, 900], [600, 900], [600, 900], [900, 600]];
  const items = dimensions.map(([width, height], index) => photo(String(index + 1), null, { width, height }));
  const spreads = makeAlbumSpreads(items, 1234);
  assert.deepEqual(spreads.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]), [
    [['1'], ['2', '3']], [['4'], []], [['5'], ['6']], [['7'], []], [['8'], []],
  ]);
  assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
  assert.ok(spreads.flatMap(({ left, right }) => [left, right]).every((leaf) => !leaf.some(isPortraitMedia) || leaf.length === 1));
  assert.deepEqual(makeAlbumSpreads([]), []);
});

test('all-portrait albums keep one photo per leaf and support single-photo spreads', () => {
  const items = Array.from({ length: 5 }, (_, index) => photo(String(index), null, { width: 500, height: 900 }));
  const spreads = makeAlbumSpreads(items);
  assert.ok(spreads.every(({ left, right }) => left.length === 1 && right.length <= 1));
  assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
  assert.deepEqual(makeAlbumSpreads([items[0]])[0], { left: [items[0]], right: [] });
});

test('landscape, square and unknown dimensions use at most three photos per spread', () => {
  const items = [
    photo('landscape', null, { width: 900, height: 600 }), photo('square', null, { width: 600, height: 600 }),
    photo('unknown', null), photo('invalid', null, { width: 0, height: 900 }),
    photo('audio', null, { fileType: 'audio', width: 100, height: 200 }),
  ];
  assert.ok(items.every((item) => !isPortraitMedia(item)));
  assert.equal(isPortraitMedia(photo('infinite', null, { width: 600, height: Infinity })), false);
  assert.equal(isPortraitMedia(photo('vertical-video', null, { fileType: 'video', width: 720, height: 1280 })), true);
  assert.ok(makeAlbumSpreads(items).every(({ left, right }) => left.length + right.length <= 3));
  assert.deepEqual(makeAlbumSpreads(items).flatMap(({ left, right }) => [...left, ...right]), items);
  assert.equal(albumPhotoRatio(items[0]), 1.5);
  assert.equal(albumPhotoRatio(items[1]), 1);
  for (const item of items.slice(2)) assert.equal(albumPhotoRatio(item), 1.5);
  for (const dimensions of [{ width: -10, height: 20 }, { width: 10, height: 0 }, { width: Infinity, height: 20 }, { width: 20, height: NaN }]) {
    assert.equal(albumPhotoRatio(photo('invalid', null, dimensions)), 1.5);
  }
  assert.equal(albumPhotoRatio(photo('panorama', null, { width: 12000, height: 1000 })), 12);
  assert.equal(albumPhotoRatio(photo('tall', null, { width: 1000, height: 12000 })), 1 / 12);
});

test('seeded layouts vary between one, two and three without reshuffling on metadata edits', () => {
  const items = Array.from({ length: 100 }, (_, index) => photo(String(index), null, { width: 900, height: 600 }));
  const spreads = makeAlbumSpreads(items, 1234);
  const ids = (pages) => pages.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]);
  assert.deepEqual([...new Set(spreads.map(({ left, right }) => left.length + right.length))].sort(), [1, 2, 3]);
  assert.deepEqual(ids(makeAlbumSpreads(items, 1234)), ids(spreads));
  assert.notDeepEqual(ids(makeAlbumSpreads(items, 7890)), ids(spreads));
  const updated = items.map((item) => ({ ...item, comment: 'New caption', rating: 5, favorite: true }));
  assert.deepEqual(ids(makeAlbumSpreads(updated, 1234)), ids(spreads));
  assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
});

test('all mixed three-photo orientation combinations preserve order and isolated portraits', () => {
  for (let mask = 0; mask < 8; mask++) {
    const items = Array.from({ length: 3 }, (_, index) => photo(String(index), null, { width: mask & (1 << index) ? 400 : 900, height: 600 }));
    for (const seed of [0, 1234, 50000, 0xFFFFFFFF]) {
      const spreads = makeAlbumSpreads(items, seed);
      assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
      assert.ok(spreads.every(({ left, right }) => left.length + right.length >= 1 && left.length + right.length <= 3));
      assert.ok(spreads.flatMap(({ left, right }) => [left, right]).every((leaf) => !leaf.some(isPortraitMedia) || leaf.length === 1));
    }
  }
});

test('album captions, ratings, favorites and view counts follow the current media while preserving album order', () => {
  const first = photo('1', '2026-09-12', { comment: '이전 기록', rating: 1, favorite: false, viewCount: 2 });
  const second = photo('2', '2026-09-12');
  const albums = [{ id: 'book', title: '가을 기록', coverColor: '#E5E1D5', items: [second, first] }];
  const updated = { ...first, comment: '바람이 좋았던 날', rating: 5, favorite: true, viewCount: 3 };
  const [album] = syncAlbumMedia(albums, [updated, second]);
  assert.deepEqual(album.items.map((item) => item.id), ['2', '1']);
  assert.strictEqual(album.items[1], updated);
  assert.equal(album.title, albums[0].title);
  assert.equal(album.coverColor, albums[0].coverColor);
  assert.equal(albums[0].items[1].comment, '이전 기록');
});

test('unregistering media removes it from every album without deleting the albums', () => {
  const removed = photo('1', null);
  const retained = photo('2', null);
  const albums = [{ id: 'one', items: [removed, retained] }, { id: 'two', items: [removed] }];
  assert.deepEqual(syncAlbumMedia(albums, [retained]).map((album) => album.items.map((item) => item.id)), [['2'], []]);
  assert.deepEqual(syncAlbumMedia(albums, []).map((album) => album.id), ['one', 'two']);
  assert.ok(syncAlbumMedia(albums, []).every((album) => album.items.length === 0));
  assert.equal(albums[0].items.length, 2);
});

test('an album loaded before the media list keeps its photos until loading succeeds', () => {
  const item = photo('1', null);
  const albums = [{ id: 'book', items: [item] }];
  assert.deepEqual(syncAlbumMedia(albums, [], false)[0].items, [item]);
  assert.deepEqual(syncAlbumMedia(albums, [], true)[0].items, []);
});

test('updating album media leaves the current spread and last-page contents in place', () => {
  const items = Array.from({ length: 9 }, (_, index) => photo(String(index + 1), '2026-09-12'));
  const albums = [{ id: 'book', items }];
  const current = items.map((item) => item.id === '5' ? { ...item, comment: '두 번째 펼침의 기록' } : item);
  const before = makeAlbumSpreads(albums[0].items, 1234);
  const after = makeAlbumSpreads(syncAlbumMedia(albums, current)[0].items, 1234);
  const ids = (spreads) => spreads.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]);
  assert.deepEqual(ids(after), ids(before));
  assert.equal(after.flatMap(({ left, right }) => [...left, ...right]).find((item) => item.id === '5').comment, '두 번째 펼침의 기록');
  assert.deepEqual(ids(after).at(-1), ids(before).at(-1));
});
