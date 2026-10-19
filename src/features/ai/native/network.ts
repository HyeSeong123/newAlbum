import { finiteVector, PREPROCESS, preprocess, type RGBImage } from './core';
export const ARCHITECTURE = 'gss-rgb-mlp-192-24-512-k-v1';
export const SHAPES = [192, 24, 512] as const;
export interface Dense { input: number; output: number; weights: number[]; bias: number[] }
export interface Model {
  format: 1; architecture: typeof ARCHITECTURE; preprocess: typeof PREPROCESS;
  task: 'synthetic-rgb-classification'; status: 'untrained' | 'synthetic-trained';
  seed: number; steps: number; classes: number; layers: Dense[];
}
export function random(seed: number) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('INVALID_SEED');
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export function initialize(seed = 73, classes = 3): Model {
  if (!Number.isInteger(classes) || classes < 2 || classes > 32) throw new Error('INVALID_CLASSES');
  const rng = random(seed), sizes = [...SHAPES, classes];
  const layers = sizes.slice(1).map((output, i) => ({ input: sizes[i], output, weights: Array.from({ length: sizes[i] * output }, () => (rng() * 2 - 1) * Math.sqrt(6 / (sizes[i] + output))), bias: Array(output).fill(0) }));
  return { format: 1, architecture: ARCHITECTURE, preprocess: PREPROCESS, task: 'synthetic-rgb-classification', status: 'untrained', seed, steps: 0, classes, layers };
}
export function validateModel(m: Model) {
  if (!m || m.format !== 1 || m.architecture !== ARCHITECTURE || m.preprocess !== PREPROCESS || m.task !== 'synthetic-rgb-classification' || !['untrained', 'synthetic-trained'].includes(m.status) || !Number.isInteger(m.steps) || m.steps < 0 || (m.status === 'synthetic-trained' && m.steps === 0) || !Number.isInteger(m.classes) || m.classes < 2 || m.classes > 32 || !Number.isInteger(m.seed) || m.seed < 1 || m.seed > 0xffffffff || !Array.isArray(m.layers) || m.layers.length !== 3) throw new Error('INVALID_MODEL');
  const sizes = [...SHAPES, m.classes];
  m.layers.forEach((layer, i) => {
    if (!layer || layer.input !== sizes[i] || layer.output !== sizes[i + 1]) throw new Error('INVALID_TENSOR_SHAPE');
    finiteVector(layer.weights, layer.input * layer.output); finiteVector(layer.bias, layer.output);
  });
}
function pass(m: Model, input: Float32Array) {
  finiteVector(input, SHAPES[0]);
  const activations: Float32Array[] = [input];
  for (let l = 0; l < m.layers.length; l++) {
    const layer = m.layers[l], previous = activations[l], out = new Float32Array(layer.output);
    for (let j = 0; j < layer.output; j++) {
      let v = layer.bias[j]; for (let i = 0; i < layer.input; i++) v += previous[i] * layer.weights[j * layer.input + i];
      out[j] = l === m.layers.length - 1 ? v : Math.tanh(v);
    }
    activations.push(out);
  }
  const logits = activations[3], max = Math.max(...logits), probabilities = Float32Array.from(logits, x => Math.exp(x - max));
  const sum = probabilities.reduce((a, b) => a + b, 0);
  for (let i = 0; i < probabilities.length; i++) probabilities[i] /= sum;
  finiteVector(probabilities, m.classes);
  return { activations, probabilities };
}
/** Internal 512 hidden activations are diagnostic, NOT face/pet embeddings. */
export function infer(m: Model, image: RGBImage) {
  validateModel(m); if (m.status !== 'synthetic-trained') throw new Error('MODEL_UNTRAINED');
  const { probabilities } = pass(m, preprocess(image));
  return { task: m.task, probabilities: Array.from(probabilities), identitySupported: false as const };
}
export interface Sample { id: string; group: string; source: string; label: number; image: RGBImage }
export function evaluate(m: Model, samples: Sample[]) {
  if (!samples.length) throw new Error('EMPTY_DATASET');
  let loss = 0, correct = 0;
  for (const sample of samples) {
    if (!Number.isInteger(sample.label) || sample.label < 0 || sample.label >= m.classes) throw new Error('INVALID_LABEL');
    const p = pass(m, preprocess(sample.image)).probabilities;
    loss -= Math.log(Math.max(1e-10, p[sample.label])); if (p.indexOf(Math.max(...p)) === sample.label) correct++;
  }
  return { loss: loss / samples.length, accuracy: correct / samples.length, samples: samples.length };
}
/** One deterministic SGD epoch, full backpropagation through all three layers. */
export function trainEpoch(m: Model, samples: Sample[], learningRate = 0.025) {
  validateModel(m);
  if (!samples.length || !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.1) throw new Error('INVALID_TRAINING_CONFIG');
  for (const sample of samples) {
    if (!Number.isInteger(sample.label) || sample.label < 0 || sample.label >= m.classes) throw new Error('INVALID_LABEL');
    const { activations, probabilities } = pass(m, preprocess(sample.image));
    let delta = Float32Array.from(probabilities); delta[sample.label] -= 1;
    for (let l = m.layers.length - 1; l >= 0; l--) {
      const layer = m.layers[l], previous = activations[l], next = new Float32Array(layer.input);
      // Compute previous-layer derivatives BEFORE updating this layer's weights.
      for (let i = 0; i < layer.input; i++) {
        let sum = 0; for (let j = 0; j < layer.output; j++) sum += layer.weights[j * layer.input + i] * delta[j];
        next[i] = sum * (1 - previous[i] ** 2);
      }
      for (let j = 0; j < layer.output; j++) {
        for (let i = 0; i < layer.input; i++) layer.weights[j * layer.input + i] -= learningRate * delta[j] * previous[i];
        layer.bias[j] -= learningRate * delta[j];
      }
      delta = next;
    }
    m.steps++;
  }
  m.status = 'synthetic-trained'; validateModel(m);
}
export function synthetic(seed = 501, count = 90): { train: Sample[]; validation: Sample[] } {
  const rng = random(seed), train: Sample[] = [], validation: Sample[] = [];
  for (let n = 0; n < count; n++) {
    const label = n % 3, data = new Uint8Array(8 * 8 * 3);
    for (let p = 0; p < data.length; p++) data[p] = Math.round((p % 3 === label ? 185 : 20) + rng() * 40);
    const sample = { id: `synthetic-${seed}-${n}`, group: `capture-${seed}-${n}`, source: `generated-${seed}-${n}`, label, image: { width: 8, height: 8, channels: 3 as const, data } };
    (n % 5 === 0 ? validation : train).push(sample);
  }
  return { train, validation };
}
export function assertSplit(train: Sample[], validation: Sample[]) {
  if (!train.length || !validation.length) throw new Error('EMPTY_SPLIT');
  for (const key of ['id', 'group', 'source'] as const) {
    const held = new Set(validation.map(s => s[key]));
    if (train.some(s => !s[key] || held.has(s[key])) || validation.some(s => !s[key])) throw new Error(`LEAKING_SPLIT_${key}`);
  }
}
