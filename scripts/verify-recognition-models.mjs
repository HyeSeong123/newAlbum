import { existsSync, readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync(new URL('./recognition-models.lock.json', import.meta.url), 'utf8'));
if (lock.models.length || lock.deployment !== 'excluded-from-product') throw new Error('Excluded recognition models must not be enabled');
for (const name of ['people512', 'pet-pose', 'onnx-runtime', 'recognition-provenance.json']) {
  if (existsSync(new URL(`../public/models/${name}`, import.meta.url))) throw new Error(`Excluded model asset: ${name}`);
}
