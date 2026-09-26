import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the project's compiler so this suite also runs on Node versions without TS stripping.
const source = await readFile(new URL('../src/features/media/journalModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const {
  albumLeafLayout, arrangeJournalItems, filterJournalMonth, formatJournalDate, journalMonths,
  journalMonthTitle, makeAlbumSpreads, isPortraitMedia, mediaSummary, resolveJournalMonth, shuffleAlbumItems, syncAlbumMedia, uniqueAlbumItems,
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
  const pages = makeAlbumSpreads(source);
  assert.deepEqual(pages.map(({ left, right }) => left.length + right.length), [4, 4, 1]);
  assert.ok(pages.every(({ left, right }) => left.length <= 2 && right.length <= 2));
  assert.deepEqual(pages.flatMap(({ left, right }) => [...left, ...right]), source);
  assert.deepEqual(makeAlbumSpreads(source), pages);
  assert.deepEqual(makeAlbumSpreads([]), []);
});

test('duplicate IDs and source paths are displayed once without merging distinct same-name photos', () => {
  const first = photo('1', null, { filePath: 'C:/one/photo.jpg', fileName: 'photo.jpg' });
  const second = photo('2', null, { filePath: 'C:/two/photo.jpg', fileName: 'photo.jpg' });
  const third = photo('3', null);
  const fourth = photo('4', null);
  const items = [first, { ...first }, { ...first, id: 'duplicate-path' }, second, third, fourth, second];
  const unique = uniqueAlbumItems(items);
  assert.deepEqual(unique, [first, second, third, fourth]);
  assert.equal(items.length, 7);
  assert.deepEqual(makeAlbumSpreads(unique), [{ left: [first, second], right: [third, fourth] }]);
  assert.deepEqual(uniqueAlbumItems([]), []);
});

test('explicit shuffle does not mutate saved items or lose duplicate-looking photos', () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const shuffled = shuffleAlbumItems(source, () => 0);
  assert.notDeepEqual(shuffled, source);
  assert.deepEqual([...shuffled].sort(), source);
  assert.deepEqual(source, ['a', 'b', 'c', 'd', 'e']);
});

test('interleaved portraits fill a four-photo leaf and landscapes fill two-photo leaves', () => {
  const dimensions = [[600, 900], [900, 600], [900, 600], [900, 600], [600, 900], [600, 900], [600, 900], [900, 600]];
  const items = dimensions.map(([width, height], index) => photo(String(index + 1), null, { width, height }));
  const spreads = makeAlbumSpreads(items);
  assert.deepEqual(spreads.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]), [
    [['1', '5', '6', '7'], ['2', '3']], [['4', '8'], []],
  ]);
  assert.deepEqual(items.map(item => item.id), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(spreads.flatMap(({ left, right }) => [albumLeafLayout(left), albumLeafLayout(right)]), ['grid', 'rows', 'rows', 'single']);
  assert.deepEqual(makeAlbumSpreads([]), []);
});

test('short portrait albums never split a full four-photo leaf to balance the spread', () => {
  const items = Array.from({ length: 5 }, (_, index) => photo(String(index), null, { width: 500, height: 900 }));
  const spreads = makeAlbumSpreads(items);
  assert.deepEqual(spreads.map(({ left, right }) => [left.length, right.length]), [[4, 1]]);
  assert.deepEqual(makeAlbumSpreads(items.slice(0, 4)).map(({ left, right }) => [left.length, right.length]), [[4, 0]]);
  assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
  assert.deepEqual(makeAlbumSpreads([items[0]])[0], { left: [items[0]], right: [] });
});

test('portrait leaves hold up to four photos with stable uncropped grid layouts', () => {
  for (let count = 1; count <= 25; count++) {
    const items = Array.from({ length: count }, (_, index) => photo(String(index), null, { width: 600, height: 900 }));
    const spreads = makeAlbumSpreads(items);
    assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
    assert.deepEqual(makeAlbumSpreads(items), spreads);
    assert.equal(spreads.length, Math.ceil(count / 8));
    assert.ok(spreads.slice(0, -1).every(({ left, right }) => left.length === 4 && right.length === 4));
    for (const leaf of spreads.flatMap(({ left, right }) => [left, right])) {
      assert.ok(leaf.length <= 4);
      if (leaf.length > 2) assert.equal(albumLeafLayout(leaf), 'grid');
    }
    const leaves = spreads.flatMap(({ left, right }) => [left, right]).filter(leaf => leaf.length);
    assert.ok(leaves.slice(0, -1).every(leaf => leaf.length === 4));
  }
});

test('all orientation combinations keep category order, full leaves and exactly-once membership', () => {
  for (let mask = 0; mask < 1024; mask++) {
    const items = Array.from({ length: 10 }, (_, index) => photo(String(index), null, {
      width: mask & (1 << index) ? 600 : 1200, height: 900,
    }));
    const spreads = makeAlbumSpreads(items);
    const leaves = spreads.flatMap(({ left, right }) => [left, right]).filter(leaf => leaf.length);
    const actual = leaves.flat();
    assert.equal(new Set(actual.map(item => item.id)).size, items.length);
    assert.equal(actual.length, items.length);
    assert.ok(spreads.slice(0, -1).every(({ left, right }) => left.length && right.length));
    for (const portrait of [false, true]) {
      assert.deepEqual(actual.filter(item => isPortraitMedia(item) === portrait), items.filter(item => isPortraitMedia(item) === portrait));
      const group = leaves.filter(leaf => isPortraitMedia(leaf[0]) === portrait);
      assert.ok(group.slice(0, -1).every(leaf => leaf.length === (portrait ? 4 : 2)));
    }
    for (const leaf of leaves) {
      const portrait = isPortraitMedia(leaf[0]);
      assert.ok(leaf.length <= (portrait ? 4 : 2));
      assert.ok(leaf.every(item => isPortraitMedia(item) === portrait));
    }
  }
});

test('landscape, square and unknown dimensions always use four photos per full spread', () => {
  const items = [
    photo('landscape', null, { width: 900, height: 600 }), photo('square', null, { width: 600, height: 600 }),
    photo('unknown', null), photo('invalid', null, { width: 0, height: 900 }),
    photo('audio', null, { fileType: 'audio', width: 100, height: 200 }),
  ];
  assert.ok(items.every((item) => !isPortraitMedia(item)));
  assert.equal(isPortraitMedia(photo('infinite', null, { width: 600, height: Infinity })), false);
  assert.equal(isPortraitMedia(photo('vertical-video', null, { fileType: 'video', width: 720, height: 1280 })), true);
  assert.deepEqual(makeAlbumSpreads(items).map(({ left, right }) => left.length + right.length), [4, 1]);
  assert.deepEqual(makeAlbumSpreads(items).flatMap(({ left, right }) => [...left, ...right]), items);
});

test('grouping is stable across reopening and caption edits while new dimensions retain every photo', () => {
  const items = Array.from({ length: 100 }, (_, index) => photo(String(index), null, { width: 900, height: 600 }));
  const spreads = makeAlbumSpreads(items);
  const ids = (pages) => pages.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]);
  assert.equal(spreads.length, 25);
  assert.ok(spreads.every(({ left, right }) => left.length === 2 && right.length === 2));
  assert.deepEqual(ids(makeAlbumSpreads(items)), ids(spreads));
  const updated = items.map((item) => ({ ...item, comment: 'New caption', rating: 5, favorite: true }));
  assert.deepEqual(ids(makeAlbumSpreads(updated)), ids(spreads));
  const portraits = updated.map((item) => ({ ...item, width: 600, height: 900 }));
  const regrouped = makeAlbumSpreads(portraits);
  assert.equal(regrouped.length, 13);
  assert.deepEqual(regrouped.flatMap(({ left, right }) => [...left, ...right]), portraits);
  assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
});

test('all three-photo orientation combinations fit one spread without mixing portrait leaves', () => {
  for (let mask = 0; mask < 8; mask++) {
    const items = Array.from({ length: 3 }, (_, index) => photo(String(index), null, { width: mask & (1 << index) ? 400 : 900, height: 600 }));
    const spreads = makeAlbumSpreads(items);
    const actual = spreads.flatMap(({ left, right }) => [...left, ...right]);
    assert.deepEqual(actual.map(item => item.id).sort(), items.map(item => item.id));
    assert.equal(spreads.length, 1);
    for (const leaf of [spreads[0].left, spreads[0].right]) {
      assert.ok(leaf.every(item => isPortraitMedia(item) === isPortraitMedia(leaf[0])));
    }
  }
});

test('every album length retains each photo exactly once without empty intermediate leaves', () => {
  for (let count = 0; count <= 17; count++) {
    const items = Array.from({ length: count }, (_, index) => photo(String(index), null));
    const spreads = makeAlbumSpreads(items);
    assert.equal(spreads.length, Math.ceil(count / 4));
    assert.deepEqual(spreads.flatMap(({ left, right }) => [...left, ...right]), items);
    assert.ok(spreads.slice(0, -1).every(({ left, right }) => left.length === 2 && right.length === 2));
  }
});

test('leaf layout handles missing, invalid, square, portrait and video dimensions', () => {
  const landscape = photo('wide', null, { width: 900, height: 600 });
  assert.equal(albumLeafLayout([]), 'single');
  assert.equal(albumLeafLayout([landscape]), 'single');
  for (const dimensions of [{}, { width: 0, height: 600 }, { width: 600, height: Infinity }, { width: 900, height: 600 }, { fileType: 'audio', width: 600, height: 900 }]) {
    assert.equal(albumLeafLayout([landscape, photo('other', null, dimensions)]), 'rows');
  }
  for (const dimensions of [{ width: 600, height: 600 }, { width: 600, height: 900 }, { fileType: 'video', width: 600, height: 900 }]) {
    assert.equal(albumLeafLayout([landscape, photo('other', null, dimensions)]), 'columns');
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
  const before = makeAlbumSpreads(albums[0].items);
  const after = makeAlbumSpreads(syncAlbumMedia(albums, current)[0].items);
  const ids = (spreads) => spreads.map(({ left, right }) => [left.map((item) => item.id), right.map((item) => item.id)]);
  assert.deepEqual(ids(after), ids(before));
  assert.equal(after.flatMap(({ left, right }) => [...left, ...right]).find((item) => item.id === '5').comment, '두 번째 펼침의 기록');
  assert.deepEqual(ids(after).at(-1), ids(before).at(-1));
});
