import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkRelease, inventoryFiles, requiredNotices } from '../scripts/release/check-ai-assets.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gss-package-'));
  const put = async (file, value) => { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); };
  const bytes = Buffer.from('test-weights-not-a-real-model'), spec = { sha256: hash(bytes), bytes: bytes.length };
  await put('scripts/face-models.lock.json', JSON.stringify({ models: { 'face_recognition_model.bin': spec.sha256 } }));
  await put('scripts/recognition-models.lock.json', JSON.stringify({ commercialClearanceConfirmed: false, deployment: 'excluded-from-product', models: [] }));
  await put('scripts/pet-model-lock.json', JSON.stringify({ models: { detector: { files: { 'model.json': spec } } } }));
  await put('src/features/pets/engine/cat-face-cascade.json', '{}');
  await put('docs/release-decisions/2026-10-20-public-release.md', 'Release with documented uncertainties; no legal clearance claimed.');
  await put('docs/rights-scope-correction-2026-10-20.md', 'Exclude FaceX512 and QuadPose; retain basic recognition.');
  for (const name of requiredNotices) await put(`public/notices/${name}`, `test notice: ${name}`);
  for (const name of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm']) await put(`node_modules/@tensorflow/tfjs-backend-wasm/dist/${name}`, bytes);
  await put('node_modules/@tensorflow/tfjs-backend-wasm/README.md', 'test runtime readme');
  await put('node_modules/@vladmandic/face-api/LICENSE', 'test face license');
  for (const file of ['faces/face_recognition_model.bin', 'pets/detector/model.json']) await put(`public/models/${file}`, bytes);
  for (const name of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm']) await put(`public/models/faces/runtime/${name}`, bytes);
  for (const name of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm']) await put(`public/models/pets/runtime/${name}`, bytes);
  for (const file of ['faces/provenance.json', 'pets/runtime/manifest.json']) await put(`public/models/${file}`, '{}');
  const copies = {
    'faces/LICENSE': 'node_modules/@vladmandic/face-api/LICENSE',
    'faces/runtime/TFJS-WASM-README.md': 'node_modules/@tensorflow/tfjs-backend-wasm/README.md',
    'faces/runtime/TFJS-LICENSE': 'public/notices/pet-models-Apache-2.0.txt',
    'pets/LICENSE': 'public/notices/pet-models-Apache-2.0.txt',
  };
  for (const [dest, source] of Object.entries(copies)) await put(`public/models/${dest}`, await readFile(path.join(root, source)));
  const inventory = {};
  for (const file of [...inventoryFiles, ...requiredNotices.map(name => `public/notices/${name}`)]) inventory[file] = hash(await readFile(path.join(root, file)));
  const policy = { schemaVersion: 1, activeModelProfile: 'person128-pet-basic-no-pose', correctionRecord: 'docs/rights-scope-correction-2026-10-20.md', releaseDecision: 'proceed-with-documented-uncertainties', commercialRightsVerified: false, decisionRecord: 'docs/release-decisions/2026-10-20-public-release.md', inventory };
  await put('public/notices/ai-release-status.json', JSON.stringify(policy));
  return { root, put, policy };
}

test('recorded packaging decision permits existing models without falsifying rights status', async () => {
  const { root, put, policy } = await fixture();
  try {
    assert.deepEqual(await checkRelease(root), []);
    await put('public/notices/ai-release-status.json', JSON.stringify({ ...policy, commercialRightsVerified: true }));
    assert.ok((await checkRelease(root)).includes('INVALID_RELEASE_RECORD'));
    await put('public/notices/ai-release-status.json', 'null');
    assert.ok((await checkRelease(root)).includes('INVALID_RELEASE_RECORD'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('tampered or unrecorded weights and missing notices block packaging', async () => {
  const { root, put } = await fixture();
  try {
    await put('public/models/faces/face_recognition_model.bin', 'tampered');
    await put('public/models/people512/renamed-weights.bin', 'excluded');
    await put('public/models/native-dev/model.json', '{}');
    await rm(path.join(root, 'public/notices/pet-cat-face-license.txt'));
    let failures = await checkRelease(root);
    assert.ok(failures.includes('MISSING_FILE:public/notices/pet-cat-face-license.txt'));
    await put('public/notices/pet-cat-face-license.txt', 'test notice: pet-cat-face-license.txt');
    failures = await checkRelease(root);
    assert.ok(failures.includes('ASSET_MISMATCH:public/models/faces/face_recognition_model.bin'));
    assert.ok(failures.includes('UNRECORDED_MODEL_ASSET:public/models/native-dev/model.json'));
    assert.ok(failures.includes('EXCLUDED_MODEL_ASSET:public/models/people512/renamed-weights.bin'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('checks final frontend copies and rejects changed inventory', async () => {
  const { root, put } = await fixture();
  try {
    await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
    assert.deepEqual(await checkRelease(root, { verifyDist: true }), []);
    await rm(path.join(root, 'dist/models/faces/face_recognition_model.bin'));
    assert.ok((await checkRelease(root, { verifyDist: true })).includes('MISSING_FILE:dist/models/faces/face_recognition_model.bin'));
    await put('scripts/face-models.lock.json', '{"models":{}}');
    assert.ok((await checkRelease(root)).includes('INVENTORY_CHANGED:scripts/face-models.lock.json'));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('excluded weights cannot be re-enabled by merely updating the inventory hash', async () => {
  const { root, put, policy } = await fixture();
  try {
    const lock = JSON.stringify({ deployment:'excluded-from-product', models:[{path:'people512/renamed.onnx',sha256:'a'.repeat(64)}] });
    await put('scripts/recognition-models.lock.json', lock);
    policy.inventory['scripts/recognition-models.lock.json'] = hash(lock);
    await put('public/notices/ai-release-status.json', JSON.stringify(policy));
    assert.ok((await checkRelease(root)).includes('EXCLUDED_MODELS_ENABLED'));
  } finally { await rm(root, { recursive:true, force:true }); }
});
