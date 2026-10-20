import { existsSync, readdirSync, readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync(new URL('./recognition-models.lock.json', import.meta.url), 'utf8'));
if (lock.models.length || lock.deployment !== 'excluded-from-product') throw new Error('Excluded recognition models must not be enabled');
for (const file of ['face-models.lock.json', 'pet-model-lock.json']) {
 const inventory = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
 if (inventory.deployment !== 'research-only-not-in-product') throw new Error(`Research inventory enabled: ${file}`);
}
const models = new URL('../public/models/', import.meta.url);
if (existsSync(models) && readdirSync(models).length) throw new Error('Product must contain no model assets');
