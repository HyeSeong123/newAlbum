// These fixed application asset directories contain removed third-party models,
// never user photos or database files. Remove stale outputs from prior builds.
import { rm } from 'node:fs/promises';
for (const assets of ['public', 'dist']) {
  for (const name of ['people512', 'pet-pose', 'onnx-runtime', 'recognition-provenance.json']) {
    await rm(new URL(`../${assets}/models/${name}`, import.meta.url), { recursive: true, force: true });
  }
  for (const name of ['onnx-runtime-MIT.txt', 'pet-pose-NOTICE.txt', 'recognition-095-NOTICE.txt', 'recognition-095-review.json', 'recognition-models-Apache-2.0.txt']) {
    await rm(new URL(`../${assets}/notices/${name}`, import.meta.url), { force: true });
  }
}
console.log('FaceX512, QuadPose and their ONNX runtime removed; stale generated assets cleaned.');
