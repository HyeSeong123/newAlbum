import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../public/models/pets/', import.meta.url);
const lock = JSON.parse(await readFile(new URL('./pet-model-lock.json', import.meta.url), 'utf8'));
for (const [name, model] of Object.entries(lock.models)) {
  const dir = new URL(`${name}/`, root);
  await mkdir(dir, { recursive: true });
  for (const [file, expected] of Object.entries(model.files)) {
    if (!/^[\w.-]+$/.test(file)) throw new Error('Invalid model filename');
    const target = new URL(file, dir);
    let bytes;
    try { bytes = await readFile(target); } catch {
      const response = await fetch(new URL(file, model.url), { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Pet model integrity check failed: ${name}/${file}`);
    const temp = new URL(`${file}.tmp`, dir);
    await writeFile(temp, bytes); await rename(temp, target);
  }
}
await writeFile(new URL('LICENSE', root), await readFile(new URL('../public/notices/pet-models-Apache-2.0.txt', import.meta.url)));
// Exact npm version and integrity are locked in package-lock.json; no CDN at runtime.
const wasmPackage = new URL('../node_modules/@tensorflow/tfjs-backend-wasm/', import.meta.url);
const wasmMetadata = JSON.parse(await readFile(new URL('package.json', wasmPackage), 'utf8'));
if (wasmMetadata.version !== '4.22.0' || wasmMetadata.license !== 'Apache-2.0') throw new Error('Unexpected pet WASM runtime');
const runtime = new URL('runtime/', root);
await mkdir(runtime, { recursive: true });
const runtimeFiles = {};
for (const file of ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm']) {
  const bytes = await readFile(new URL(`dist/${file}`, wasmPackage));
  await writeFile(new URL(file, runtime), bytes);
  runtimeFiles[file] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(new URL('manifest.json', runtime), JSON.stringify({ package: wasmMetadata.name, version: wasmMetadata.version, license: wasmMetadata.license, files: runtimeFiles }, null, 2));
