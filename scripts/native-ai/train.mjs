import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { modelUrl } from '../ts-module-loader.mjs';
import { loadDataset, sha256 } from './data.mjs';
const { initialize, synthetic, assertSplit, evaluate, trainEpoch, validateModel, infer } = await import(await modelUrl('features/ai/native/network.ts'));
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const output = path.resolve(arg('--out', path.join(root, 'native-ai-output')));
const epochs = Number(arg('--epochs', 12)), seed = Number(arg('--seed', 73)), learningRate = 0.025;
if (!Number.isInteger(epochs) || epochs < 1 || epochs > 10000) throw new Error('INVALID_EPOCHS');
const dataset = args.includes('--dataset') ? await loadDataset(path.resolve(arg('--dataset'))) : synthetic();
assertSplit(dataset.train, dataset.validation);
const datasetDigest = dataset.manifestSha256 ?? sha256(JSON.stringify({ generator: 'synthetic-v1', seed: 501, train: dataset.train, validation: dataset.validation }));
const sources = ['src/features/ai/native/core.ts', 'src/features/ai/native/network.ts', 'scripts/native-ai/train.mjs', 'scripts/native-ai/data.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async name => [name, sha256(await readFile(path.join(root, name)))])));
const trainingSourceSha256 = sha256(JSON.stringify(sourceHashes));
let model = initialize(seed), completedEpochs = 0, history = [];
if (args.includes('--resume')) {
  const checkpointBytes = await readFile(path.resolve(arg('--resume')));
  const checkpoint = JSON.parse(checkpointBytes);
  if (checkpoint.schemaVersion !== 1 || checkpoint.trainingSourceSha256 !== trainingSourceSha256 || checkpoint.datasetSha256 !== datasetDigest || checkpoint.optimizer !== 'sgd' || checkpoint.learningRate !== learningRate || checkpoint.modelSha256 !== sha256(JSON.stringify(checkpoint.model)) || !Number.isInteger(checkpoint.epoch) || checkpoint.epoch < 1 || !Array.isArray(checkpoint.history) || checkpoint.history.length !== checkpoint.epoch) throw new Error('INCOMPATIBLE_CHECKPOINT');
  model = checkpoint.model; validateModel(model); completedEpochs = checkpoint.epoch; history = checkpoint.history;
}
await mkdir(output, { recursive: true });
async function atomic(name, value) { const target = path.join(output, name); await writeFile(target + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(target + '.tmp', target); }
const before = evaluate(model, dataset.validation), initialHash = sha256(JSON.stringify(model));
let interrupted = false; process.on('SIGINT', () => { interrupted = true; });
for (let epoch = completedEpochs + 1; epoch <= completedEpochs + epochs; epoch++) {
  trainEpoch(model, dataset.train, learningRate);
  const metrics = { epoch, steps: model.steps, train: evaluate(model, dataset.train), validation: evaluate(model, dataset.validation) };
  history.push(metrics); console.log(JSON.stringify(metrics));
  await atomic('checkpoint.json', { schemaVersion: 1, trainingSourceSha256, model, modelSha256: sha256(JSON.stringify(model)), epoch, optimizer: 'sgd', learningRate, datasetSha256: datasetDigest, history });
  if (interrupted) break;
}
const weightsText = JSON.stringify(model) + '\n';
await writeFile(path.join(output, 'model.json.tmp'), weightsText); await rename(path.join(output, 'model.json.tmp'), path.join(output, 'model.json'));
const restored = JSON.parse(await readFile(path.join(output, 'model.json'), 'utf8')); validateModel(restored);
const probe = infer(restored, dataset.validation[0].image);
const report = { schemaVersion: 1, nodeVersion: process.version, trainingSourceSha256, task: model.task, scope: 'pipeline-proof-only-not-person-or-pet-recognition', initialization: 'random-xorshift32-xavier-uniform', seed: model.seed, externalPretrainedWeights: false, distillation: false, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes, datasetSha256: datasetDigest, generatedSynthetic: !args.includes('--dataset'), optimizer: 'sgd', learningRate, epochsThisRun: history.length - completedEpochs, totalEpochs: history.length, steps: model.steps, initialModelSha256: initialHash, weightsSha256: sha256(weightsText), before, after: evaluate(restored, dataset.validation), probe, history, productionApproved: false, commercialRightsApproved: false };
await atomic('provenance.json', report);
await atomic('sha256sums.json', Object.fromEntries(await Promise.all(['model.json', 'checkpoint.json', 'provenance.json'].map(async name => [name, sha256(await readFile(path.join(output, name)))]))));
if (args.includes('--install-probe')) {
  const installed = path.join(root, 'public/models/native-dev'); await mkdir(installed, { recursive: true });
  for (const filename of ['model.json', 'provenance.json']) await copyFile(path.join(output, filename), path.join(installed, filename));
}
console.log(JSON.stringify({ output, weightsSha256: report.weightsSha256, before: report.before, after: report.after, productionApproved: false }));
