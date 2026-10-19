import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { modelUrl } from './model-loader.mjs';
import { sha256 } from '../scripts/native-ai/data.mjs';
const network = await import(await modelUrl('features/ai/native/network.ts'));
const workerModule = await modelUrl('features/ai/native/native.worker.ts');
test('actual native Worker entry executes exported own weights, reuses model and recovers after load failure', async () => {
  // Only Web Worker event transport is adapted; session/core/network code is
  // exactly the app Worker module, executing in an actual separate Node thread.
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(${JSON.stringify(workerModule)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true});});`, { eval: true });
  try {
    assert.deepEqual((await once(worker, 'message'))[0], { ready: true });
    const model = network.initialize(), dataset = network.synthetic();
    for (let i = 0; i < 3; i++) network.trainEpoch(model, dataset.train);
    const text = JSON.stringify(model), hash = sha256(text), image = dataset.validation[0].image, expected = network.infer(model, image);
    async function request(id, digest = hash, modelText) {
      const pixels = image.data.slice().buffer;
      const result = once(worker, 'message');
      worker.postMessage({ id, pixels, width: image.width, height: image.height, modelText, sha256: digest }, [pixels]);
      assert.equal(pixels.byteLength, 0, 'ownership must transfer to Worker');
      return (await result)[0];
    }
    assert.deepEqual((await request(1, hash, text)).result, expected);
    for (let i = 2; i <= 30; i++) assert.deepEqual((await request(i)).result, expected);
    assert.match((await request(31, '0'.repeat(64), text)).error, /HASH/);
    assert.deepEqual((await request(32, hash, text)).result, expected);
  } finally { await worker.terminate(); }
});
