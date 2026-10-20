// These fixed application asset directories contain excluded third-party models,
// never user photos or database files. Remove stale outputs from prior builds.
import { rm } from 'node:fs/promises';
for (const name of ['people512', 'pet-pose', 'onnx-runtime', 'recognition-provenance.json']) {
  await rm(new URL(`../public/models/${name}`, import.meta.url), { recursive: true, force: true });
}
console.log('FaceX512, QuadPose and their ONNX runtime excluded from product assets.');
