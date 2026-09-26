import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadModel(path) {
  const source = await readFile(new URL(`../src/features/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { selectMediaCollection, searchMedia, anniversaryMemories } = await loadModel('media/collectionModel.ts');
const calendar = await loadModel('calendar/calendarModel.ts');
const comments = await loadModel('media/mediaComments.ts');
const { indexFaces, mediaForFaces } = await loadModel('people/peopleModel.ts');
const { petPhotos, petCovers } = await loadModel('pets/petModel.ts');
const photo = (id, extra = {}) => ({ id: String(id), fileType: 'image', fileName: `사진 ${id}.jpg`, comment: '', tags: [], takenAt: null, rating: 0, favorite: false, ...extra });
const defaults = { sort: 'date-desc', mediaType: 'all', favoritesOnly: false, commentsOnly: false, minimumRating: 0 };
const ids = (items) => items.map((item) => item.id);

test('collection sorting preserves numeric ties, undated placement and source order', () => {
  const items = [photo(2, { takenAt: '2026-09-12' }), photo(10, { takenAt: '2026-09-12' }), photo(1), photo(3, { takenAt: '2025-09-12' })];
  assert.deepEqual(ids(selectMediaCollection(items, defaults, {})), ['10', '2', '3', '1']);
  assert.deepEqual(ids(selectMediaCollection(items, { ...defaults, sort: 'date-asc' }, {})), ['3', '2', '10', '1']);
  assert.deepEqual(ids(selectMediaCollection(items, { ...defaults, sort: 'name' }, {})), ['1', '2', '3', '10']);
  assert.deepEqual(ids(items), ['2', '10', '1', '3']);
});

test('combined filters apply before comment, rating and view sorting', () => {
  const items = [photo(1, { favorite: true, rating: 4, viewCount: 2 }), photo(2, { favorite: true, rating: 5, viewCount: 9 }), photo(3, { rating: 5 }), photo(4, { fileType: 'video', rating: 5, favorite: true })];
  const counts = { 1: 8, 2: 2, 3: 9, 4: 4 };
  const options = { ...defaults, mediaType: 'image', favoritesOnly: true, commentsOnly: true, minimumRating: 4 };
  assert.deepEqual(ids(selectMediaCollection(items, { ...options, sort: 'comments' }, counts)), ['1', '2']);
  for (const sort of ['rating', 'views']) assert.deepEqual(ids(selectMediaCollection(items, { ...options, sort }, counts)), ['2', '1']);
  assert.deepEqual(selectMediaCollection(items, { ...options, minimumRating: 6 }, counts), []);
});

test('all optimized comparators match the previous implementation on mixed records', () => {
  const items = Array.from({ length: 160 }, (_, index) => photo(index, {
    takenAt: index % 7 ? `2026-09-${String(index % 28 + 1).padStart(2, '0')}` : null,
    rating: index % 6, viewCount: index % 3 ? index % 17 : undefined,
  }));
  const counts = Object.fromEntries(items.map((item, index) => [item.id, index % 11]));
  for (const sort of ['date-desc', 'date-asc', 'name', 'comments', 'rating', 'views']) {
    const expected = [...items].sort((a, b) => {
      if (sort === 'date-desc') return (b.takenAt ?? '').localeCompare(a.takenAt ?? '') || b.id.localeCompare(a.id, undefined, { numeric: true });
      if (sort === 'date-asc') return (a.takenAt ?? '9999').localeCompare(b.takenAt ?? '9999') || a.id.localeCompare(b.id, undefined, { numeric: true });
      if (sort === 'name') return a.fileName.localeCompare(b.fileName, 'ko', { numeric: true });
      if (sort === 'comments') return counts[b.id] - counts[a.id] || (b.takenAt ?? '').localeCompare(a.takenAt ?? '');
      if (sort === 'rating') return b.rating - a.rating || (b.takenAt ?? '').localeCompare(a.takenAt ?? '');
      return (b.viewCount ?? 0) - (a.viewCount ?? 0) || (b.takenAt ?? '').localeCompare(a.takenAt ?? '');
    });
    assert.deepEqual(selectMediaCollection(items, { ...defaults, sort }, counts), expected, sort);
  }
});

test('search includes names, captions and tags without changing whitespace semantics', () => {
  const items = [photo(1, { fileName: 'Jeju.JPG' }), photo(2, { comment: '가족 여행' }), photo(3, { tags: ['SEA'] })];
  assert.strictEqual(searchMedia(items, ''), items);
  assert.deepEqual(ids(searchMedia(items, 'jeju')), ['1']);
  assert.deepEqual(ids(searchMedia(items, '가족')), ['2']);
  assert.deepEqual(ids(searchMedia(items, 'sea')), ['3']);
  assert.deepEqual(searchMedia(items, ' absent '), []);
});

test('anniversary memories respect the supplied local day and exclude this year', () => {
  const items = [photo(1, { takenAt: '2025-09-24' }), photo(2, { takenAt: '2026-09-24' }), photo(3), photo(4, { takenAt: '2024-09-24' })];
  assert.deepEqual(ids(anniversaryMemories(items, '2026-09-24')), ['1', '4']);
  assert.deepEqual(anniversaryMemories(items, '2026-09-25'), []);
});

test('calendar cells fill complete weeks for leap years and different starting weekdays', () => {
  for (const year of [2024, 2025, 2026]) for (let month = 1; month <= 12; month++) {
    const cells = calendar.monthCells(year, month);
    const days = cells.filter((cell) => cell.kind === 'day');
    assert.equal(cells.length % 7, 0);
    assert.equal(days.length, new Date(year, month, 0).getDate());
    assert.equal(cells.indexOf(days[0]), new Date(year, month - 1, 1).getDay());
    assert.equal(new Set(cells.map((cell) => cell.id)).size, cells.length);
  }
});

test('calendar years handle large libraries without spreading arguments or accepting corrupt years', () => {
  const items = Array.from({ length: 200_000 }, () => photo(1, { takenAt: '2025-05-31' }));
  items.push(photo(2, { takenAt: '1890-01-01' }), photo(3, { takenAt: '2040-01-01' }), photo(4, { takenAt: 'oops' }), photo(5, { takenAt: '0000-01-01' }));
  const years = calendar.calendarYears(items, 2026);
  assert.equal(years[0], '2040');
  assert.equal(years.at(-1), '1890');
  assert.equal(years.length, 151);
});

const event = (id, date, yearly = false) => ({ id, date, title: id, kind: 'birthday', showDday: true, yearly });
test('indexed annual and dated events retain stored order without modifying saved dates', () => {
  const events = { first: [event('annual', '2020-09-24', true), event('other', '2026-09-25')], next: [event('exact', '2026-09-24'), event('annual2', '2021-09-24', true)] };
  const lookup = calendar.indexCalendarEvents(events);
  assert.deepEqual(calendar.eventsOnDate(lookup, '2026-09-24').map((item) => item.id), ['annual', 'exact', 'annual2']);
  assert.ok(calendar.eventsOnDate(lookup, '2026-09-24').every((item) => item.date === '2026-09-24'));
  assert.deepEqual(calendar.eventsOnDate(lookup, '2027-09-24').map((item) => item.id), ['annual', 'annual2']);
  assert.deepEqual(calendar.eventsOnDate(lookup, '2026-09-26'), []);
  assert.equal(events.first[0].date, '2020-09-24');
});

test('calendar counts and local date calculations retain display behavior', () => {
  assert.equal(calendar.formatMediaCount([]), '사진 0장');
  assert.equal(calendar.formatMediaCount([photo(1), photo(2, { fileType: 'video' }), photo(3, { fileType: 'audio' })]), '사진 1장 · 영상 1개 · 음성 1개');
  const today = new Date(2026, 8, 24, 23, 59);
  assert.equal(calendar.localDateKey(today), '2026-09-24');
  assert.equal(calendar.formatDday('2026-09-24', today), 'D-day');
  assert.equal(calendar.formatDday('2026-09-25', today), 'D-1');
  assert.equal(calendar.formatDday('2026-09-23', today), 'D+1');
});

test('face indexes separate unnamed people, retain order and deduplicate original photos', () => {
  const faces = [{ id: 10, person_id: 1, media_id: 2 }, { id: 11, person_id: 1, media_id: 2 }, { id: 12, person_id: 2, media_id: 1 }, { id: 13, person_id: 99, media_id: 3 }];
  const index = { people: [{ id: 1, name: '가족' }, { id: 2, name: '  ' }], faces, scanned: [1, 2] };
  const lookup = indexFaces(index);
  assert.deepEqual(lookup.byPerson.get(1), faces.slice(0, 2));
  assert.deepEqual(lookup.unidentified, [faces[2]]);
  assert.strictEqual(lookup.peopleById.get(1), index.people[0]);
  assert.equal(lookup.scanned.has(2), true);
  assert.deepEqual(ids(mediaForFaces([photo(1), photo(2), photo(3)], faces.slice(0, 2))), ['2']);
  assert.deepEqual(ids(mediaForFaces([photo(3), photo(2), photo(1)], faces)), ['3', '2', '1']);
  assert.deepEqual(mediaForFaces([photo(1)], []), []);
});

test('pet cover fallback uses library order, missing IDs are ignored and links stay unique', () => {
  const photos = [photo(3), photo(1), photo(2)];
  const pets = [{ id: 1, cover_media_id: 2, media_ids: [1, 2, 3] }, { id: 2, cover_media_id: 999, media_ids: [2, 1, 3, 3] }, { id: 3, cover_media_id: null, media_ids: [999] }];
  const covers = petCovers(photos, pets);
  assert.equal(covers.get(1).id, '2');
  assert.equal(covers.get(2).id, '3');
  assert.equal(covers.has(3), false);
  assert.deepEqual(ids(petPhotos(photos, pets[1])), ['3', '1', '2']);
  assert.deepEqual(petPhotos(photos, undefined), []);
});

test('comments and calendar storage reject corrupt values while retaining valid entries and legacy comments', () => {
  const previous = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    const saved = { id: 'c', author: '나', content: '기록', createdAt: '' };
    for (const invalid of ['null', '[]', 'true', '{broken']) {
      values.set('oraedameun.mediaComments', invalid);
      values.set('oraedameun.calendarEvents', invalid);
      assert.deepEqual(comments.loadMediaComments(), {});
      assert.deepEqual(calendar.loadCalendarEvents(), {});
    }
    values.set('oraedameun.mediaComments', JSON.stringify({ 1: [saved, null, {}], 2: 'wrong' }));
    assert.deepEqual(comments.loadMediaComments(), { 1: [saved] });
    comments.saveMediaComments({ 1: [saved] });
    assert.deepEqual(comments.getMediaComments(photo(1, { comment: 'old' }), comments.loadMediaComments()), [saved]);
    assert.equal(comments.getMediaComments(photo(2, { comment: 'legacy' }), {})[0].id, 'legacy-comment-2');
    assert.deepEqual(comments.getMediaComments(photo(2), {}), []);
    values.set('oraedameun.calendarEvents', JSON.stringify({ date: [event('valid', '2026-09-24'), { ...event('bad', '2026-09-24'), kind: 'invalid' }, null] }));
    assert.equal(calendar.loadCalendarEvents().date.length, 1);
    assert.equal(calendar.saveStringMap('oraedameun.dayNotes', { day: 'memo' }), true);
    assert.deepEqual(calendar.loadDayNotes(), { day: 'memo' });
    globalThis.window.localStorage.setItem = () => { throw new Error('quota'); };
    assert.equal(calendar.saveStringMap('dayNotes', {}), false);
    assert.doesNotThrow(() => comments.saveMediaComments({}));
    assert.doesNotThrow(() => calendar.saveCalendarEvents({}));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
