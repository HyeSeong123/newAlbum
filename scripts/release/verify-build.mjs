import { readdir, readFile } from 'node:fs/promises';
import { checkRelease } from './check-ai-assets.mjs';
const assets = await readdir('dist/assets');
if (!assets.some(name => /^person\.worker-/.test(name)) || !assets.some(name => /^pet\.worker-/.test(name))) throw new Error('RECOGNITION_WORKER_MISSING');
if (assets.some(name => /^(native\.worker-|RecognitionEvaluation-|NativePipelineProbe-)/.test(name))) throw new Error('RESEARCH_UI_IN_APP_BUILD');
const errors = await checkRelease(undefined, { verifyDist: true });
if (errors.length) throw new Error(errors.join('\n'));
console.log('Existing offline recognition restored; research UI excluded; packaged model files and notices verified.');

for (const name of assets.filter(name => name.endsWith('.js'))) {
  const code = await readFile(`dist/assets/${name}`, 'utf8');
  if (/facex-tiny|quadpose\.onnx|onnxruntime-web|ort-wasm-simd/.test(code)) throw new Error(`EXCLUDED_MODEL_RUNTIME:${name}`);
}
