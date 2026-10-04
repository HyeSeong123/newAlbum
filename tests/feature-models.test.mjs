import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadModel(path) {
  const source = await readFile(new URL(`../src/features/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { selectMediaCollection, searchMedia, dateRangeError } = await loadModel('media/collectionModel.ts');
const calendar = await loadModel('calendar/calendarModel.ts');
const comments = await loadModel('media/mediaComments.ts');
const { indexFaces, mediaForFaces } = await loadModel('people/peopleModel.ts');
const { petPhotos, petCovers } = await loadModel('pets/petModel.ts');
const photo = (id, extra = {}) => ({ id: String(id), fileType: 'image', fileName: `사진 ${id}.jpg`, comment: '', takenAt: null, rating: 0, favorite: false, ...extra });
const defaults = { sort: 'date-desc', mediaType: 'all', favoritesOnly: false, commentsOnly: false, minimumRating: 0 };
const ids = (items) => items.map((item) => item.id);

test('taken date range includes both endpoints and supports open bounds without timezone conversion', () => {
  const items = [photo(1, { takenAt: '2026-05-31' }), photo(2, { takenAt: '2026-06-01', favorite: true }),
    photo(3, { takenAt: '2026-06-30T23:59:59-07:00' }), photo(4, { takenAt: '2026-07-01' }), photo(5)];
  const select = patch => ids(selectMediaCollection(items, { ...defaults, ...patch }, {}));
  assert.deepEqual(select({ startDate: '2026-06-01', endDate: '2026-06-30' }), ['3', '2']);
  assert.deepEqual(select({ startDate: '2026-06-01' }), ['4', '3', '2']);
  assert.deepEqual(select({ endDate: '2026-06-01' }), ['2', '1']);
  assert.deepEqual(select({ startDate: '2026-06-01', endDate: '2026-06-01', favoritesOnly: true }), ['2']);
  assert.deepEqual(select({ startDate: '', endDate: '' }), ['4', '3', '2', '1', '5']);
  assert.deepEqual(ids(items), ['1', '2', '3', '4', '5']);
});

test('invalid or reversed ranges show validation errors and do not silently search everything', () => {
  for (const [startDate, endDate] of [['2026-07-01', '2026-06-01'], ['2026-02-30', ''], ['', '2026-13-01']]) {
    assert.ok(dateRangeError(startDate, endDate));
    assert.deepEqual(selectMediaCollection([photo(1, { takenAt: '2026-06-01' })], { ...defaults, startDate, endDate }, {}), []);
  }
  assert.equal(dateRangeError('2024-02-29', '2024-02-29'), '');
  assert.ok(dateRangeError('2025-02-29', ''));
  assert.deepEqual(selectMediaCollection([photo(1, { takenAt: '2026-02-30' })], { ...defaults, endDate: '2026-03-01' }, {}), []);
});

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

test('search includes titles, filenames and captions without changing whitespace semantics', () => {
  const items = [photo(1, { fileName: 'Jeju.JPG', title: '바람이 불던 오후' }), photo(2, { comment: '가족 여행' })];
  assert.strictEqual(searchMedia(items, ''), items);
  assert.deepEqual(ids(searchMedia(items, 'jeju')), ['1']);
  assert.deepEqual(ids(searchMedia(items, '바람이')), ['1']);
  assert.deepEqual(ids(searchMedia(items, '가족')), ['2']);
  assert.deepEqual(searchMedia(items, ' absent '), []);
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

test('calendar counts and local date calculations retain display behavior', () => {
  assert.equal(calendar.formatMediaCount([]), '사진 0장');
  assert.equal(calendar.formatMediaCount([photo(1), photo(2, { fileType: 'video' }), photo(3, { fileType: 'audio' })]), '사진 1장 · 영상 1개 · 음성 1개');
  const today = new Date(2026, 8, 24, 23, 59);
  assert.equal(calendar.localDateKey(today), '2026-09-24');
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
      assert.deepEqual(comments.loadMediaComments(), {});
    }
    values.set('oraedameun.mediaComments', JSON.stringify({ 1: [saved, null, {}], 2: 'wrong' }));
    assert.deepEqual(comments.loadMediaComments(), { 1: [saved] });
    comments.saveMediaComments({ 1: [saved] });
    assert.deepEqual(comments.getMediaComments(photo(1, { comment: 'old' }), comments.loadMediaComments()), [saved]);
    assert.equal(comments.getMediaComments(photo(2, { comment: 'legacy' }), {})[0].id, 'legacy-comment-2');
    assert.deepEqual(comments.getMediaComments(photo(2), {}), []);
    assert.equal(calendar.saveStringMap('oraedameun.dayNotes', { day: 'memo' }), true);
    assert.deepEqual(calendar.loadDayNotes(), { day: 'memo' });
    globalThis.window.localStorage.setItem = () => { throw new Error('quota'); };
    assert.equal(calendar.saveStringMap('dayNotes', {}), false);
    assert.doesNotThrow(() => comments.saveMediaComments({}));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('calendar registration joins consecutive photo/video dates and separates gaps across year boundaries', () => {
  const items = [photo(1, { takenAt: '2025-12-31' }), photo(2, { takenAt: '2026-01-01', fileType: 'video' }), photo(3, { takenAt: '2026-01-03' }), photo(4, { takenAt: '2026-01-03' })];
  const entries = calendar.createCalendarRegistrations(items, { title: '겨울 여행', dateMode: 'taken' }, '기본', '#ccc');
  assert.deepEqual(entries.map(({ startDate, endDate, mediaIds }) => ({ startDate, endDate, mediaIds })), [
    { startDate: '2025-12-31', endDate: '2026-01-01', mediaIds: ['1', '2'] },
    { startDate: '2026-01-03', endDate: '2026-01-03', mediaIds: ['3', '4'] },
  ]);
  assert.ok(entries.every(entry => entry.title === '겨울 여행'));
  assert.equal(items[0].takenAt, '2025-12-31');
});

test('calendar registration requires explicit dates for undated files and validates reversed/invalid ranges', () => {
  assert.throws(() => calendar.createCalendarRegistrations([photo(1)], { dateMode: 'taken', title: '' }, '기록', '#ccc'), /촬영 날짜/);
  for (const [startDate, endDate] of [['2026-02-30', '2026-03-01'], ['2026-06-03', '2026-06-01']]) {
    assert.ok(calendar.calendarRegistrationError({ dateMode: 'range', startDate, endDate }));
  }
  const entries = calendar.createCalendarRegistrations([photo(1), photo(2, { fileType: 'video' })], { dateMode: 'range', title: '', startDate: '2024-02-29', endDate: '2024-02-29' }, '하루 앨범', '#ccc', 'album-1');
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].mediaIds, ['1', '2']);
  assert.equal(entries[0].title, '하루 앨범');
  assert.equal(entries[0].albumId, 'album-1');
});

test('weekly calendar bars clip at week/month boundaries and place overlapping ranges on separate lanes', () => {
  const record = (id, startDate, endDate) => ({ id, startDate, endDate, title: id, mediaIds: ['1'], color: '#ccc' });
  const records = [record('long', '2026-05-29', '2026-06-03'), record('day', '2026-06-01', '2026-06-01'), record('later', '2026-06-03', '2026-06-03')];
  const week = ['2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06'];
  const segments = calendar.calendarWeekSegments(records, week);
  assert.deepEqual(segments.map(segment => [segment.record.id, segment.startColumn, segment.length, segment.lane]), [['long', 0, 4, 0], ['day', 1, 1, 1], ['later', 3, 1, 1]]);
  assert.equal(segments[0].continuesBefore, true);
  assert.equal(segments[0].continuesAfter, false);
  const end = calendar.calendarWeekSegments(records, ['2026-05-24', '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30']);
  assert.equal(end[0].length, 2);
  assert.equal(end[0].continuesAfter, true);
  assert.equal(calendar.calendarWeekSegments(records, [null, '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06'])[0].startColumn, 1);
});
