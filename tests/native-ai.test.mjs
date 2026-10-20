import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir, symlink } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { modelUrl } from './model-loader.mjs';
import { sha256, loadDataset } from '../scripts/native-ai/data.mjs';
import { checkRelease } from '../scripts/native-ai/release-gate.mjs';
const core = await import(await modelUrl('features/ai/native/core.ts'));
const net = await import(await modelUrl('features/ai/native/network.ts'));
const { PersonEngine, PetEngine } = await import(await modelUrl('features/ai/native/engines.ts'));
const { SyntheticSession } = await import(await modelUrl('features/ai/native/session.ts'));
const sample = net.synthetic().validation[0];

test('math validates dimension, zero, nonfinite and large finite vectors', () => {
  assert.throws(() => core.normalize([0, 0]), /ZERO_VECTOR/);
  for (const x of [NaN, Infinity, -Infinity]) assert.throws(() => core.normalize([x, 1]), /NON_FINITE/);
  assert.throws(() => core.cosine([1, 2], [1]), /DIMENSIONS/);
  assert.ok(Math.abs(Math.hypot(...core.normalize([3, 4])) - 1) < 1e-7);
  assert.ok(Math.abs(core.cosine([1e308, 1e308], [1, 1]) - 1) < 1e-6);
  assert.ok(Math.abs(core.cosineDistance([1, 0], [-1, 0]) - 2) < 1e-6);
});

test('RGB and RGBA preprocessing matches and EXIF 1..8 uses display coordinates', () => {
  // A B / C D / E F, each channel carries the marker.
  const image = { width: 2, height: 3, channels: 3, data: Uint8Array.from([1,2,3,4,5,6].flatMap(x => [x,x,x])) };
  const expected = [[1,2,3,4,5,6], [2,1,4,3,6,5], [6,5,4,3,2,1], [5,6,3,4,1,2], [1,3,5,2,4,6], [5,3,1,6,4,2], [6,4,2,5,3,1], [2,4,6,1,3,5]];
  expected.forEach((markers, i) => {
    const out = core.orientRGB({ ...image, orientation: i + 1 });
    assert.deepEqual(Array.from(out.data).filter((_, n) => n % 3 === 0), markers);
    assert.equal(out.width, i >= 4 ? 3 : 2);
  });
  const rgb = { width: 1, height: 1, channels: 3, data: new Uint8Array([0, 127, 255]) };
  assert.deepEqual(core.preprocess(rgb), core.preprocess({ ...rgb, channels: 4, data: new Uint8Array([0,127,255,0]) }));
  assert.equal(core.preprocess(rgb).length, 192); assert.equal(core.preprocess(rgb)[0], -1); assert.equal(core.preprocess(rgb)[2], 1);
  for (const broken of [{ ...rgb, width: NaN }, { ...rgb, data: [0,127,255] }, { ...rgb, orientation: 9 }, { ...rgb, height: 2 }]) assert.throws(() => core.preprocess(broken), /INVALID_IMAGE/);
});

test('untrained person/pet stages return no fabricated detections or vectors', () => {
  const person = new PersonEngine(), pet = new PetEngine();
  for (const result of [person.detect(sample.image), person.landmarks(), person.align(), person.orientation(), person.embedding512(), pet.detect(sample.image), pet.species(), pet.face(), pet.pose(), pet.orientation(), pet.features()]) {
    assert.equal(result.status, 'not-trained'); assert.equal(result.results, null); assert.equal(result.autoLink, false);
  }
});

test('feature spaces isolate versions, weights, dimensions and rear policy; mirror candidates stay review-only', () => {
  const base = { task: 'pet', species: 'dog', kind: 'identity', model: 'own-v1', weightsSha256: 'a'.repeat(64), preprocess: core.PREPROCESS, vector: [1,0], view: 'left' };
  const reference = { ...base, vector: [0,1], mirrored: [1,0], view: 'right' };
  assert.deepEqual(core.matchFeature(base, reference), { similarity: 1, needsReview: true, autoLink: false });
  for (const change of [{ model: 'v2' }, { weightsSha256: 'b'.repeat(64) }, { preprocess: 'other' }, { task: 'person' }, { vector: [1] }, { species: 'cat' }, { view: 'rear' }]) assert.throws(() => core.matchFeature(base, { ...reference, ...change }));
  assert.equal(core.matchFeature({ ...base, kind: 'color-shape', view: 'rear' }, { ...reference, kind: 'color-shape', mirrored: undefined }).autoLink, false);
  assert.throws(() => core.matchFeature({ ...base, task: 'person' }, { ...base, task: 'person' }), /INVALID_PERSON_FEATURE/);
});

test('seeded initialization is reproducible, all layers receive gradients and finite differences agree', () => {
  const model = net.initialize(73);
  assert.deepEqual(net.initialize(73), model); assert.notDeepEqual(net.initialize(74), model);
  assert.throws(() => net.infer(model, sample.image), /UNTRAINED/);
  const trained = structuredClone(model), lr = 0.00001;
  net.trainEpoch(trained, [sample], lr);
  for (let l = 0; l < 3; l++) {
    const index = model.layers[l].weights.findIndex((v, i) => Math.abs(v - trained.layers[l].weights[i]) > 1e-10);
    assert.ok(index >= 0, `layer ${l} must train`);
    const plus = structuredClone(model), minus = structuredClone(model), epsilon = 0.002;
    plus.layers[l].weights[index] += epsilon; minus.layers[l].weights[index] -= epsilon;
    const numeric = (net.evaluate(plus, [sample]).loss - net.evaluate(minus, [sample]).loss) / (2 * epsilon);
    const analytic = (model.layers[l].weights[index] - trained.layers[l].weights[index]) / lr;
    assert.ok(Math.abs(numeric - analytic) < 0.002, `layer ${l}: ${numeric} vs ${analytic}`);
  }
});

test('synthetic training lowers held-out loss and exported inference is exact; corrupt model rejected and disposed', async () => {
  const dataset = net.synthetic(); net.assertSplit(dataset.train, dataset.validation);
  const m = net.initialize(), before = net.evaluate(m, dataset.validation);
  for (let n = 0; n < 6; n++) net.trainEpoch(m, dataset.train);
  assert.ok(net.evaluate(m, dataset.validation).loss < before.loss / 10);
  const text = JSON.stringify(m), session = new SyntheticSession();
  await session.load(text, sha256(text));
  assert.deepEqual(session.run(sample.image), net.infer(m, sample.image));
  await session.load(text, sha256(text)); // deduplicated model load
  await assert.rejects(session.load(text, '0'.repeat(64)), /HASH/);
  assert.throws(() => session.run(sample.image), /NOT_LOADED/);
  session.dispose(); assert.throws(() => session.run(sample.image), /NOT_LOADED/);
  await assert.rejects(session.load('{"format":2}', sha256('{"format":2}')), /INVALID_MODEL/);
  assert.throws(() => net.validateModel({ ...m, preprocess: 'legacy' }), /INVALID_MODEL/);
  for (const key of ['id', 'group', 'source']) assert.throws(() => net.assertSplit([{ ...dataset.train[0], [key]: dataset.validation[0][key] }], dataset.validation), /LEAKING_SPLIT/);
});

test('checkpoint resume equals uninterrupted SGD and records hashes; tampering fails', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gss-checkpoint-'));
  const run = args => execFileSync(process.execPath, ['scripts/native-ai/train.mjs', ...args], { stdio: 'pipe' });
  try {
    run(['--out', path.join(dir, 'full'), '--epochs', '4']);
    run(['--out', path.join(dir, 'resume'), '--epochs', '2']);
    run(['--out', path.join(dir, 'resume'), '--epochs', '2', '--resume', path.join(dir, 'resume/checkpoint.json')]);
    assert.equal(await readFile(path.join(dir, 'full/model.json'), 'utf8'), await readFile(path.join(dir, 'resume/model.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(path.join(dir, 'resume/provenance.json')));
    assert.equal(provenance.weightsSha256, sha256(await readFile(path.join(dir, 'resume/model.json'))));
    assert.equal(provenance.externalPretrainedWeights, false); assert.equal(provenance.productionApproved, false);
    const checkpoint = JSON.parse(await readFile(path.join(dir, 'resume/checkpoint.json'))); checkpoint.model.layers[0].weights[0] += 1;
    await writeFile(path.join(dir, 'resume/checkpoint.json'), JSON.stringify(checkpoint));
    const rejected = spawnSync(process.execPath, ['scripts/native-ai/train.mjs', '--resume', path.join(dir, 'resume/checkpoint.json'), '--out', dir]);
    assert.notEqual(rejected.status, 0); assert.match(rejected.stderr.toString(), /INCOMPATIBLE_CHECKPOINT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('dataset loader requires rights, hashes, local paths and nonoverlapping sources', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gss-data-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'gss-outside-'));
  try {
    const text = JSON.stringify({ width: 1, height: 1, channels: 3, data: [1,2,3] });
    await writeFile(path.join(dir, 'rgb.json'), text);
    const rights = { commercialTraining: true, consentConfirmed: true, reviewed: true, source: 'owned-synthetic', evidence: 'owned-test-generator', reviewer: 'test', reviewedAt: '2026-10-19' };
    const record = { path: 'rgb.json', id: 'a', captureGroup: 'a', sha256: sha256(text), label: 0, split: 'train', rights };
    const manifest = { schemaVersion: 1, task: 'synthetic-rgb-classification', records: [record, { ...record, id: 'b', captureGroup: 'b', split: 'validation' }] };
    const file = path.join(dir, 'manifest.json');
    await writeFile(file, JSON.stringify(manifest)); await assert.rejects(loadDataset(file), /DUPLICATE_ACROSS_SPLITS/);
    manifest.records[0].rights = { ...rights, commercialTraining: false };
    await writeFile(file, JSON.stringify(manifest)); await assert.rejects(loadDataset(file), /UNVERIFIED_DATA_RIGHTS/);
    manifest.records[0].rights = rights; manifest.records[0].sha256 = '0'.repeat(64);
    await writeFile(file, JSON.stringify(manifest)); await assert.rejects(loadDataset(file), /DATA_HASH/);
    const outsideFile = path.join(outside, 'rgb.json');
    await writeFile(outsideFile, text);
    await symlink(outsideFile, path.join(dir, 'escape.json'), 'file');
    manifest.records[0].path = 'escape.json';
    await writeFile(file, JSON.stringify(manifest)); await assert.rejects(loadDataset(file), /DATA_PATH_ESCAPE/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('commercial gate fails on unreviewed registry and on real unexpected weight assets', async () => {
  const failures = await checkRelease();
  assert.ok(failures.includes('NATIVE_RIGHTS_REVIEW_INCOMPLETE'));
  assert.ok(!failures.some(x => x.startsWith('LEGACY_MODEL_DEPENDENCY:'))); // product no longer depends on pretrained runtimes
  const dir = await mkdtemp(path.join(tmpdir(), 'gss-release-'));
  try {
    await mkdir(path.join(dir, 'models/native'), { recursive: true }); await mkdir(path.join(dir, 'public/models'), { recursive: true });
    await writeFile(path.join(dir, 'models/native/registry.json'), JSON.stringify({ schemaVersion: 1, commercialApproved: true, reviewEvidence: ['fake-approval'], models: [{}] }));
    await writeFile(path.join(dir, 'package.json'), '{"dependencies":{"@vladmandic/face-api":"1.7.15"}}');
    assert.ok((await checkRelease(dir)).some(x => x.startsWith('LEGACY_MODEL_DEPENDENCY:')));
    await writeFile(path.join(dir, 'public/models/hidden.onnx'), 'unreviewed');
    assert.ok((await checkRelease(dir)).some(x => x.includes('UNAPPROVED_MODEL_ASSET:')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
