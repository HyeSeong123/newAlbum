import { createHash } from 'node:crypto';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const source = new URL('../node_modules/@vladmandic/face-api/', import.meta.url);
const target = new URL('../public/models/faces/', import.meta.url);
const lock = JSON.parse(await readFile(new URL('./face-models.lock.json', import.meta.url), 'utf8'));
for (const [name, expected] of [['@vladmandic/face-api','1.7.15'],['@tensorflow/tfjs','4.22.0'],['@tensorflow/tfjs-backend-wasm','4.22.0']]) {
  const metadata=JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`,import.meta.url),'utf8'));
  if(metadata.version!==expected) throw new Error(`Unexpected face runtime version: ${name}`);
}
await mkdir(target, { recursive: true });
for (const model of ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']) {
  for (const suffix of ['.bin', '-weights_manifest.json']) {
    await copyFile(new URL(`model/${model}${suffix}`, source), new URL(`${model}${suffix}`, target));
  }
}
await copyFile(new URL('LICENSE', source), new URL('LICENSE', target));

const runtime = new URL('runtime/', target);
await mkdir(runtime, { recursive: true });
for (const file of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm']) {
  await copyFile(new URL(`../node_modules/@tensorflow/tfjs-backend-wasm/dist/${file}`, import.meta.url), new URL(file, runtime));
}
await copyFile(new URL('../node_modules/@tensorflow/tfjs-backend-wasm/README.md', import.meta.url), new URL('TFJS-WASM-README.md', runtime));
await copyFile(new URL('../public/notices/pet-models-Apache-2.0.txt', import.meta.url), new URL('TFJS-LICENSE', runtime));
const models = {};
for (const model of ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']) {
  for (const suffix of ['.bin', '-weights_manifest.json']) {
    const file = `${model}${suffix}`;
    models[file] = createHash('sha256').update(await readFile(new URL(file, target))).digest('hex');
    if(models[file]!==lock.models[file]) throw new Error(`Unexpected face model checksum: ${file}`);
  }
}
const provenance = { modelVersion: 'face-api-1.7.15-ssd-68-resnet-v1', descriptorDimensions: 128, tensorflow: '4.22.0', models };
await writeFile(new URL('provenance.json', target), JSON.stringify(provenance, null, 2) + '\n');
