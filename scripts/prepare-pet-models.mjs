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
