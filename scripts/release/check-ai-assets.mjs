import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Historical inventories/notices stay as provenance, never an active asset list.
export const inventoryFiles = ['scripts/face-models.lock.json', 'scripts/recognition-models.lock.json', 'scripts/pet-model-lock.json'];
export const requiredNotices = ['face-api-original-MIT.txt', 'dlib-models-CC0.txt', 'pet-cat-face-license.txt', 'pet-models-Apache-2.0.txt'];
const excludedPackages = ['@vladmandic/face-api', '@tensorflow/tfjs', '@tensorflow/tfjs-backend-wasm', '@tensorflow-models/coco-ssd', 'onnxruntime-web'];
const forbiddenCode = /@vladmandic\/face-api|@tensorflow\/|tfjs-backend|coco-ssd|cat-frontal-cascade|facex-tiny|quadpose\.onnx|onnxruntime-web|ort-wasm-simd/;

export async function checkRelease(base = root, { verifyAssets = true, verifyDist = false } = {}) {
  const errors = [];
  const read = async file => {
    try { return await readFile(path.join(base, file)); }
    catch { errors.push(`MISSING_FILE:${file}`); return null; }
  };
  const bytes = await read('public/notices/ai-release-status.json');
  let policy;
  try { policy = JSON.parse(bytes); } catch { return [...errors, 'INVALID_RELEASE_RECORD']; }
  if (!policy || policy.schemaVersion !== 2 || policy.activeModelProfile !== 'manual-only-no-models'
      || policy.releaseDecision !== 'exclude-all-pretrained-models' || policy.commercialRightsVerified !== false
      || policy.trainedWeightsIncluded !== false || policy.modelRuntimeEnabled !== false
      || policy.decisionRecord !== 'docs/model-removal-2026-10-20.md') errors.push('INVALID_RELEASE_RECORD');
  if (!policy || typeof policy !== 'object') return errors;
  await read('docs/model-removal-2026-10-20.md');
  for (const file of [...inventoryFiles, ...requiredNotices.map(name => `public/notices/${name}`)]) {
    const data = await read(file);
    if (data && digest(data) !== policy.inventory?.[file]) errors.push(`INVENTORY_CHANGED:${file}`);
  }
  for (const file of ['scripts/face-models.lock.json', 'scripts/pet-model-lock.json']) {
    try { if (JSON.parse(await read(file)).deployment !== 'research-only-not-in-product') errors.push(`RESEARCH_INVENTORY_ENABLED:${file}`); }
    catch { errors.push(`INVALID_INVENTORY:${file}`); }
  }
  try {
    const lock = JSON.parse(await read('scripts/recognition-models.lock.json'));
    if (lock.models.length || lock.deployment !== 'excluded-from-product') errors.push('EXCLUDED_MODELS_ENABLED');
  } catch { errors.push('INVALID_RECOGNITION_INVENTORY'); }
  try {
    const pkg = JSON.parse(await read('package.json'));
    for (const name of excludedPackages) if (pkg.dependencies?.[name] || pkg.optionalDependencies?.[name]) errors.push(`PRODUCT_AI_DEPENDENCY:${name}`);
  } catch { errors.push('INVALID_PACKAGE'); }
  try { await lstat(path.join(base, 'src/features/pets/engine/cat-face-cascade.json')); errors.push('PRETRAINED_WEIGHT_IN_SOURCE:cat-face-cascade.json'); } catch (error) { if (error.code !== 'ENOENT') errors.push('SOURCE_MODEL_UNREADABLE'); }
  if (!verifyAssets) return errors;
  for (const assets of verifyDist ? ['public', 'dist'] : ['public']) {
    const directory = path.join(base, assets, 'models');
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) errors.push(`MODEL_ASSET_ROOT:${assets}/models`);
      else for (const entry of await readdir(directory)) errors.push(`EXCLUDED_MODEL_ASSET:${assets}/models/${entry}`);
    } catch (error) { if (error.code !== 'ENOENT') errors.push(`MODEL_ASSET_UNREADABLE:${assets}`); }
    const shipped = await read(`${assets}/notices/ai-release-status.json`);
    if (shipped && !shipped.equals(bytes)) errors.push(`RELEASE_RECORD_MISMATCH:${assets}`);
    for (const name of requiredNotices) {
      const data = await read(`${assets}/notices/${name}`);
      if (data && digest(data) !== policy.inventory?.[`public/notices/${name}`]) errors.push(`NOTICE_MISMATCH:${assets}/notices/${name}`);
    }
  }
  if (verifyDist) {
    let files;
    try { files = await readdir(path.join(base, 'dist/assets')); } catch { errors.push('BUILD_ASSETS_MISSING'); return errors; }
    for (const name of files) {
      if (/\.wasm$|\.onnx$|^(?:person|pet|native)\.worker-|^(?:RecognitionEvaluation|NativePipelineProbe)-/.test(name)) errors.push(`EXCLUDED_MODEL_RUNTIME:${name}`);
      if (name.endsWith('.js') && forbiddenCode.test((await read(`dist/assets/${name}`))?.toString() ?? '')) errors.push(`EXCLUDED_MODEL_CODE:${name}`);
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkRelease(root, { verifyDist: process.argv.includes('--dist') });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Manual-only product verified: no model assets or inference runtimes. Historical notices preserved; no blanket legal clearance claimed.');
}
