import { createHash, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
const root = new URL('../public/models/', import.meta.url);
const lock = JSON.parse(await readFile(new URL('./recognition-models.lock.json', import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(url) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(120000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer()); }
    catch (value) { error = value; }
  }
  throw error;
}
for (const model of lock.models) {
  const target = new URL(model.path, root);
  let bytes;
  try { bytes = await readFile(target); } catch {
    bytes = await download(model.url);
    if (sha(bytes) !== model.downloadSha256) throw new Error(`Unrecognized upstream weights: ${model.version}`);
    if (model.publicDemoAesKey) {
      // Public key in the upstream Apache demo, not an account credential.
      const key = await webcrypto.subtle.importKey('raw', Buffer.from(model.publicDemoAesKey, 'hex'), { name: 'AES-GCM' }, false, ['decrypt']);
      bytes = Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0,12) }, key, bytes.subarray(12)));
    }
  }
  if (bytes.length !== model.bytes || sha(bytes) !== model.sha256) throw new Error(`Recognition model integrity failed: ${model.version}`);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(new URL(`${model.path}.tmp`, root), bytes); await rename(new URL(`${model.path}.tmp`, root), target);
  await copyFile(new URL('../public/notices/recognition-models-Apache-2.0.txt', import.meta.url), new URL('LICENSE', target));
}
const pkg = new URL('../node_modules/onnxruntime-web/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json', pkg), 'utf8'));
if (metadata.version !== lock.runtime || metadata.license !== 'MIT') throw new Error('Unexpected ONNX runtime');
const runtime = new URL('onnx-runtime/', root); await mkdir(runtime, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) await copyFile(new URL(`dist/${name}`, pkg), new URL(name, runtime));
await copyFile(new URL('../public/notices/onnx-runtime-MIT.txt', import.meta.url), new URL('LICENSE', runtime));
await writeFile(new URL('recognition-provenance.json', root), JSON.stringify(lock, null, 2) + '\n');
