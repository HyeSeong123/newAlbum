import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const inventoryFiles = ['scripts/face-models.lock.json', 'scripts/recognition-models.lock.json', 'scripts/pet-model-lock.json', 'src/features/pets/engine/cat-face-cascade.json'];
export const requiredNotices = ['face-api-original-MIT.txt', 'dlib-models-CC0.txt', 'pet-pose-NOTICE.txt', 'pet-cat-face-license.txt', 'pet-models-Apache-2.0.txt', 'recognition-models-Apache-2.0.txt', 'onnx-runtime-MIT.txt'];

// Packaging consent is deliberately separate from legal clearance. This checks
// the recorded inventory and actual shipped bytes, never grants model rights.
export async function checkRelease(base = root, { verifyAssets = true, verifyDist = false } = {}) {
  const errors = [];
  const read = async file => {
    try { return await readFile(path.join(base, file)); }
    catch { errors.push(`MISSING_FILE:${file}`); return null; }
  };
  const policyBytes = await read('public/notices/ai-release-status.json');
  let policy;
  try { policy = JSON.parse(policyBytes); } catch { errors.push('INVALID_RELEASE_RECORD'); return errors; }
  if (!policy || typeof policy !== 'object') return [...errors, 'INVALID_RELEASE_RECORD'];
  if (policy.schemaVersion !== 1 || policy.releaseDecision !== 'proceed-with-documented-uncertainties'
      || policy.commercialRightsVerified !== false || policy.decisionRecord !== 'docs/release-decisions/2026-10-20-public-release.md') errors.push('INVALID_RELEASE_RECORD');
  await read(policy.decisionRecord === 'docs/release-decisions/2026-10-20-public-release.md' ? policy.decisionRecord : 'docs/release-decisions/2026-10-20-public-release.md');
  for (const file of [...inventoryFiles, ...requiredNotices.map(name => `public/notices/${name}`)]) {
    const bytes = await read(file);
    if (bytes && digest(bytes) !== policy.inventory?.[file]) errors.push(`INVENTORY_CHANGED:${file}`);
  }
  if (!verifyAssets || errors.length) return errors;
  const face = JSON.parse(await read('scripts/face-models.lock.json'));
  const extra = JSON.parse(await read('scripts/recognition-models.lock.json'));
  const pets = JSON.parse(await read('scripts/pet-model-lock.json'));
  const expected = new Map();
  for (const [name, sha256] of Object.entries(face.models)) expected.set(`faces/${name}`, { sha256 });
  for (const model of extra.models) expected.set(model.path, model);
  for (const [name, model] of Object.entries(pets.models)) for (const [file, spec] of Object.entries(model.files)) expected.set(`pets/${name}/${file}`, spec);
  const addCopy = async (destination, source) => {
    const bytes = await read(source);
    if (bytes) expected.set(destination, { sha256: digest(bytes), bytes: bytes.length });
  };
  await addCopy('faces/LICENSE', 'node_modules/@vladmandic/face-api/LICENSE');
  for (const name of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm']) await addCopy(`faces/runtime/${name}`, `node_modules/@tensorflow/tfjs-backend-wasm/dist/${name}`);
  await addCopy('faces/runtime/TFJS-WASM-README.md', 'node_modules/@tensorflow/tfjs-backend-wasm/README.md');
  await addCopy('faces/runtime/TFJS-LICENSE', 'public/notices/pet-models-Apache-2.0.txt');
  for (const name of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm']) await addCopy(`pets/runtime/${name}`, `node_modules/@tensorflow/tfjs-backend-wasm/dist/${name}`);
  await addCopy('pets/LICENSE', 'public/notices/pet-models-Apache-2.0.txt');
  for (const directory of ['people512', 'pet-pose']) await addCopy(`${directory}/LICENSE`, 'public/notices/recognition-models-Apache-2.0.txt');
  await addCopy('pet-pose/NOTICE', 'public/notices/pet-pose-NOTICE.txt');
  for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) await addCopy(`onnx-runtime/${name}`, `node_modules/onnxruntime-web/dist/${name}`);
  await addCopy('onnx-runtime/LICENSE', 'public/notices/onnx-runtime-MIT.txt');
  const metadata = new Set(['faces/provenance.json', 'pets/runtime/manifest.json', 'recognition-provenance.json']);
  for (const assets of verifyDist ? ['public', 'dist'] : ['public']) {
    for (const [file, spec] of expected) {
      const bytes = await read(`${assets}/models/${file}`);
      if (bytes && (digest(bytes) !== spec.sha256 || (spec.bytes !== undefined && bytes.length !== spec.bytes))) errors.push(`ASSET_MISMATCH:${assets}/models/${file}`);
    }
    for (const file of metadata) await read(`${assets}/models/${file}`);
    const shippedPolicy = await read(`${assets}/notices/ai-release-status.json`);
    if (shippedPolicy && !shippedPolicy.equals(policyBytes)) errors.push(`RELEASE_RECORD_MISMATCH:${assets}`);
    for (const name of requiredNotices) {
      const bytes = await read(`${assets}/notices/${name}`);
      if (bytes && digest(bytes) !== policy.inventory?.[`public/notices/${name}`]) errors.push(`NOTICE_MISMATCH:${assets}/notices/${name}`);
    }
    async function walk(relative = '') {
      const directory = path.join(base, assets, 'models', relative);
      let entries; try { entries = await readdir(directory); } catch { return; }
      for (const name of entries) {
        const file = path.posix.join(relative, name), info = await lstat(path.join(directory, name));
        if (info.isSymbolicLink()) errors.push(`MODEL_SYMLINK:${assets}/models/${file}`);
        else if (info.isDirectory()) await walk(file);
        else if (!expected.has(file) && !metadata.has(file)) errors.push(`UNRECORDED_MODEL_ASSET:${assets}/models/${file}`);
      }
    }
    await walk();
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkRelease(root, { verifyDist: process.argv.includes('--dist') });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('AI packaging inventory and notices verified. Release decision recorded; unresolved training-data rights remain unresolved.');
}
