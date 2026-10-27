import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const { analyzePreciseFaces } = await import(await modelUrl('features/people/engine/precision.ts'));

const face = (box, quality = 'usable', value = 0.1) => ({
  box, quality, descriptor: Array(128).fill(value), thumbnail: 'data:image/jpeg;base64,face',
  modelVersion: 'face-api-1.7.15-ssd-68-resnet-v1', view: 'unknown', rollDegrees: 0,
  pose: { version: 'landmarks-pnp-v1', view: 'unknown', yawDegrees: null, pitchDegrees: null, rollDegrees: null, quality: 'unknown', normalizedError: null },
});
const closeBox = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-8, `${actual} != ${expected}`));

test('precision maps tile detections to the original photo and never auto-confirms them', async () => {
  const visited = [];
  const result = await analyzePreciseFaces([], async region => {
    visited.push(region);
    return visited.length === 1 ? [face([0.25, 0.25, 0.25, 0.25])] : [];
  });
  assert.equal(result.faces.length, 1);
  closeBox(result.faces[0].box, [0.14, 0.14, 0.14, 0.14]);
  assert.equal(result.faces[0].quality, 'review');
  assert.equal(result.passes, 4);
  assert.deepEqual(visited, [[0, 0, .56, .56], [.44, 0, .56, .56], [0, .44, .56, .56], [.44, .44, .56, .56]]);
});

test('a face on an overlapping boundary is returned once', async () => {
  let n = 0;
  const result = await analyzePreciseFaces([], async () => {
    n++;
    if (n === 1) return [face([.46 / .56, .10 / .56, .08 / .56, .08 / .56])];
    if (n === 2) return [face([.02 / .56, .10 / .56, .08 / .56, .08 / .56])];
    return [];
  });
  assert.equal(result.faces.length, 1);
  closeBox(result.faces[0].box, [.46, .10, .08, .08]);
  assert.equal(result.passes, 4);
});

test('uncertain faces use their own original region and keep their geometry', async () => {
  const initial = [face([.3, .2, .1, .1], 'review')];
  let calls = 0;
  const result = await analyzePreciseFaces(initial, async region => {
    if (++calls <= 4) return [];
    const [x, y, w, h] = region;
    return [face([(.3-x)/w, (.2-y)/h, .1/w, .1/h], 'usable', .11)];
  });
  assert.equal(result.faces[0].descriptor[0], .11);
  assert.deepEqual(result.faces[0].box, [.3, .2, .1, .1]);
  assert.equal(result.faces[0].quality, 'review');
  assert.equal(initial[0].descriptor[0], .1);
  assert.equal(result.passes, 5);
});

test('a neighboring face cannot replace the face being refined', async () => {
  let calls = 0;
  const result = await analyzePreciseFaces([face([.3, .2, .1, .1], 'review')], async () => {
    if (++calls <= 4) return [];
    return [face([.8, .8, .1, .1], 'usable', .12)];
  });
  assert.equal(result.faces[0].descriptor[0], .1);
});

test('precision bounds extra work and keeps every original face', async () => {
  const initial = Array.from({length: 10}, (_, i) => face([i * .09, .2, .04, .04], 'review'));
  const result = await analyzePreciseFaces(initial, async () => []);
  assert.equal(result.faces.length, 10);
  assert.equal(result.passes, 8);
});

test('invalid regions and non-finite descriptors are never returned', async () => {
  const result = await analyzePreciseFaces([], async () => [
    face([NaN, .1, .1, .1]), face([.1, .1, 0, .1]), face([.95, .1, .1, .1]),
    face([.1, .1, .1, .1], 'usable', Infinity),
  ]);
  assert.deepEqual(result.faces, []);
});

test('precision propagates inference failure instead of returning a partial successful scan', async () => {
  let calls = 0;
  await assert.rejects(analyzePreciseFaces([], async () => {
    if (++calls === 2) throw new Error('model failed');
    return [face([.2, .2, .1, .1])];
  }), /model failed/);
});
