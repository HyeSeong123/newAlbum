import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
/** Fail closed: approval booleans alone do not clear a build containing legacy AI. */
export async function checkRelease(base = root) {
  const errors = [], registry = JSON.parse(await readFile(path.join(base, 'models/native/registry.json')));
  if (registry.schemaVersion !== 1 || registry.commercialApproved !== true || !registry.reviewEvidence?.length) errors.push('NATIVE_RIGHTS_REVIEW_INCOMPLETE');
  if (!Array.isArray(registry.models) || !registry.models.length) errors.push('NO_REVIEWED_PERSON_PET_MODELS');
  if (process.env.VITE_AI_ENGINE === 'legacy') errors.push('LEGACY_AI_MODE');
  // The current app still contains legacy worker imports. Commercial approval
  // requires removing these dependencies and verifying the final APK/AAB as well.
  const pkg = JSON.parse(await readFile(path.join(base, 'package.json')));
  for (const dependency of ['@vladmandic/face-api', '@tensorflow-models/coco-ssd']) if (pkg.dependencies?.[dependency]) errors.push(`LEGACY_MODEL_DEPENDENCY:${dependency}`);
  for (const directory of ['public/models', 'dist']) {
    async function walk(dir) {
      let entries; try { entries = await readdir(dir); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
      for (const name of entries) {
        const file = path.join(dir, name);
        if ((await stat(file)).isDirectory()) { await walk(file); continue; }
        const rel = path.relative(base, file);
        if (/\.(onnx|bin|weights|safetensors|pt|pth|tflite)$/i.test(name) || /cascade|recognition-provenance|facex|quadpose|mobilenet|native-dev/i.test(rel)) errors.push(`UNAPPROVED_MODEL_ASSET:${rel}`);
      }
    }
    await walk(path.join(base, directory));
  }
  // Deliberately block until a real artifact review implementation is in place.
  // This is not a legal opinion or a claim of commercial readiness.
  errors.push('FINAL_APK_AAB_AND_TRAINING_LINEAGE_REVIEW_REQUIRED');
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkRelease();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
}
