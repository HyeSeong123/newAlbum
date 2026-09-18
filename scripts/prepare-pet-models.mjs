import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
const root = new URL('../public/models/pets/', import.meta.url);
const models = {
  detector: 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
  embedding: 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json',
};
for (const [name, url] of Object.entries(models)) {
  const dir = new URL(`${name}/`, root);
  await mkdir(dir, { recursive: true });
  async function download(file) {
    if (!/^[\w.-]+$/.test(file)) throw new Error('Invalid model filename');
    const target = new URL(file, dir);
    try { return await readFile(target); } catch {}
    const response = await fetch(new URL(file, url), { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const temp = new URL(`${file}.tmp`, dir);
    await writeFile(temp, bytes);
    await rename(temp, target);
    return bytes;
  }
  const model = JSON.parse((await download('model.json')).toString());
  for (const group of model.weightsManifest) for (const path of group.paths) await download(path);
}
try { await readFile(new URL('LICENSE', root)); } catch {
  const response = await fetch('https://raw.githubusercontent.com/tensorflow/tfjs-models/master/LICENSE', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Model license download failed');
  await writeFile(new URL('LICENSE', root), await response.text());
}
