import {readFile} from 'node:fs/promises';
import {modelUrl} from '../tests/model-loader.mjs';
const {evaluatePets}=await import(await modelUrl('features/pets/engine/evaluation.ts'));
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/evaluate-pets.mjs /path/to/held-out-features.json');
console.log(JSON.stringify(evaluatePets(JSON.parse(await readFile(file,'utf8'))),null,2));
