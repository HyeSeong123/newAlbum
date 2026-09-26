import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { albumContents, makeBookSpreads, moveContent } = await import(await modelUrl('features/albums/albumContent.ts'));
const photos = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), fileType: 'image', width: 600, height: 900 }));
const chapter = { id: 'chapter-1', kind: 'CHAPTER', title: '제주로 가는 길', body: 'DAY 1', displayDuration: 5, transitionType: 'fade', commentVisible: true };

test('legacy albums produce media contents in saved order without mutating data', () => {
  const album = { items: photos };
  const entries = albumContents(album);
  assert.deepEqual(entries.map(entry => entry.mediaId), photos.map(item => item.id));
  assert.equal(album.contents, undefined);
  assert.ok(entries.every(entry => entry.kind === 'PHOTO' && entry.displayDuration === 5));
  assert.deepEqual(makeBookSpreads(photos)[0].left, photos.slice(0, 4));
});
test('chapters are real leaves and photo grouping cannot cross a chapter boundary', () => {
  const entries = albumContents({ items: photos });
  const contents = [...entries.slice(0, 2), chapter, ...entries.slice(2)];
  const pages = makeBookSpreads(photos, contents);
  assert.deepEqual(pages[0].left, photos.slice(0, 2));
  assert.equal(pages[0].rightPage, chapter);
  assert.deepEqual(pages[1].left, photos.slice(2, 6));
  assert.deepEqual(pages[1].right, photos.slice(6));
  assert.deepEqual(pages.flatMap(page => [...page.left, ...page.right]), photos);
});
test('moving and removing contents preserves the surviving order and missing media never removes chapters', () => {
  const entries = [chapter, ...albumContents({ items: photos })];
  const moved = moveContent(entries, 0, 3);
  assert.equal(moved[3], chapter);
  assert.equal(entries[0], chapter);
  assert.equal(moveContent(entries, 0, -1), entries);
  assert.deepEqual(albumContents({ items: [], contents: entries }), [chapter]);
  assert.equal(makeBookSpreads([], [chapter])[0].leftPage, chapter);
});
