import { mkdir, copyFile } from 'node:fs/promises';
const source = new URL('../node_modules/@vladmandic/face-api/', import.meta.url);
const target = new URL('../public/models/faces/', import.meta.url);
await mkdir(target, { recursive: true });
for (const model of ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']) {
  for (const suffix of ['.bin', '-weights_manifest.json']) {
    await copyFile(new URL(`model/${model}${suffix}`, source), new URL(`${model}${suffix}`, target));
  }
}
await copyFile(new URL('LICENSE', source), new URL('LICENSE', target));
