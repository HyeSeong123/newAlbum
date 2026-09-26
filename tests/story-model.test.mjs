import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { storyScenes, adjacentPhotos, albumDateRange } = await import(await modelUrl('features/albums/story-player/storyModel.ts'));
const items = Array.from({ length:100 }, (_, i) => ({ id:String(i), fileType:i === 2 ? 'video' : 'image', takenAt:`2026-05-${i % 2 ? '17' : '14'}` }));
test('story follows mixed content order and supports old albums and text-only albums', () => {
  const legacy = storyScenes({ items });
  const text = { id:'written', kind:'TEXT', title:'끝', body:'본문', displayDuration:8, transitionType:'slide' };
  const scenes = storyScenes({ items, contents:[text, legacy[2].entry, legacy[0].entry] });
  assert.deepEqual(scenes.map(scene => scene.entry.kind), ['TEXT','VIDEO','PHOTO']);
  assert.equal(scenes[1].media, items[2]);
  assert.equal(storyScenes({ items:[], contents:[text] })[0].entry.body, '본문');
});
test('only adjacent photos are preloaded, regardless of album size', () => {
  const scenes = storyScenes({ items });
  assert.deepEqual(adjacentPhotos(scenes, 1), [items[0]]);
  assert.deepEqual(adjacentPhotos(scenes, 50), [items[49],items[51]]);
  assert.deepEqual(adjacentPhotos(scenes, 99), [items[98]]);
  assert.deepEqual(adjacentPhotos([], 0), []);
});
test('unsafe legacy timings fall back to bounded durations and known transitions', () => {
  const entry = storyScenes({ items:[items[0]] })[0].entry;
  for (const [value, expected] of [[NaN,5],[-3,1],[9999,600],[3,3]]) {
    const scene = storyScenes({ items, contents:[{ ...entry, displayDuration:value, transitionType:'unknown' }] })[0];
    assert.equal(scene.entry.displayDuration, expected);
    assert.equal(scene.entry.transitionType, 'fade');
  }
  assert.equal(albumDateRange(items), '2026-05-14 ~ 2026-05-17');
  assert.equal(albumDateRange([]), '');
});
