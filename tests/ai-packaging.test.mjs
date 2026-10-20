import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkRelease, inventoryFiles, requiredNotices } from '../scripts/release/check-ai-assets.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gss-manual-package-'));
  const put = async (file, value) => { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); };
  await put('package.json', JSON.stringify({ dependencies: {}, devDependencies: { '@tensorflow/tfjs': '4.22.0' } }));
  await put('scripts/face-models.lock.json', JSON.stringify({deployment:'research-only-not-in-product',models:{historical:'retained'}}));
  await put('scripts/pet-model-lock.json', JSON.stringify({deployment:'research-only-not-in-product',models:{historical:'retained'}}));
  await put('scripts/recognition-models.lock.json', JSON.stringify({deployment:'excluded-from-product',models:[]}));
  await put('docs/model-removal-2026-10-20.md', 'All pretrained models excluded; manual data retained.');
  for (const name of requiredNotices) await put(`public/notices/${name}`, `test notice: ${name}`);
  const inventory = {};
  for (const file of [...inventoryFiles, ...requiredNotices.map(name => `public/notices/${name}`)]) inventory[file] = hash(await readFile(path.join(root, file)));
  const policy={schemaVersion:2,activeModelProfile:'manual-only-no-models',releaseDecision:'exclude-all-pretrained-models',commercialRightsVerified:false,trainedWeightsIncluded:false,modelRuntimeEnabled:false,decisionRecord:'docs/model-removal-2026-10-20.md',inventory};
  const save = () => put('public/notices/ai-release-status.json',JSON.stringify(policy));
  await save();return {root,put,policy,save};
}

test('manual packaging preserves historical notices without falsifying legal clearance',async()=>{
 const {root,put,policy,save}=await fixture();try{
  assert.deepEqual(await checkRelease(root),[]);
  policy.commercialRightsVerified=true;await save();assert.ok((await checkRelease(root)).includes('INVALID_RELEASE_RECORD'));
  await put('public/notices/ai-release-status.json','null');assert.ok((await checkRelease(root)).includes('INVALID_RELEASE_RECORD'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('every pretrained asset path, including renamed or research weights, blocks product packaging',async()=>{
 const {root,put}=await fixture();try{
  for(const name of ['faces/face_recognition_model.bin','faces/ssd_mobilenetv1_model.bin','pets/detector/model.json','pets/embedding/weights.bin','people512/renamed.bin','pet-pose/quadpose.onnx','native-dev/model.json','renamed.dat']){
   await put(`public/models/${name}`,'unapproved');
   assert.ok((await checkRelease(root)).some(e=>e.startsWith('EXCLUDED_MODEL_ASSET:public/models/')),name);
   await rm(path.join(root,'public/models'),{recursive:true,force:true});
  }
  await put('src/features/pets/engine/cat-face-cascade.json','{}');
  assert.ok((await checkRelease(root)).includes('PRETRAINED_WEIGHT_IN_SOURCE:cat-face-cascade.json'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('missing or modified license notices and inventory remain release blockers',async()=>{
 const {root,put}=await fixture();try{
  await rm(path.join(root,'public/notices/pet-cat-face-license.txt'));
  assert.ok((await checkRelease(root)).includes('MISSING_FILE:public/notices/pet-cat-face-license.txt'));
  await put('public/notices/pet-cat-face-license.txt','changed');
  assert.ok((await checkRelease(root)).includes('INVENTORY_CHANGED:public/notices/pet-cat-face-license.txt'));
  await put('scripts/face-models.lock.json','{}');
  assert.ok((await checkRelease(root)).includes('INVENTORY_CHANGED:scripts/face-models.lock.json'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('updating an inventory hash cannot re-enable model deployment',async()=>{
 const {root,put,policy,save}=await fixture();try{
  const file='scripts/recognition-models.lock.json';const lock=JSON.stringify({deployment:'excluded-from-product',models:[{path:'renamed.onnx'}]});
  await put(file,lock);policy.inventory[file]=hash(lock);await save();
  assert.ok((await checkRelease(root)).includes('EXCLUDED_MODELS_ENABLED'));
  const face='scripts/face-models.lock.json';const enabled=JSON.stringify({deployment:'product',models:{}});
  await put(face,enabled);policy.inventory[face]=hash(enabled);await save();
  assert.ok((await checkRelease(root)).includes(`RESEARCH_INVENTORY_ENABLED:${face}`));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('production dependencies cannot restore an inference library',async()=>{
 const {root,put}=await fixture();try{
  for(const name of ['@vladmandic/face-api','@tensorflow/tfjs','@tensorflow/tfjs-backend-wasm','@tensorflow-models/coco-ssd','onnxruntime-web']){
   await put('package.json',JSON.stringify({dependencies:{[name]:'1'}}));
   assert.ok((await checkRelease(root)).includes(`PRODUCT_AI_DEPENDENCY:${name}`));
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('final frontend copies reject model assets, workers, WASM and embedded inference code',async()=>{
 const {root,put}=await fixture();try{
  await cp(path.join(root,'public'),path.join(root,'dist'),{recursive:true});await mkdir(path.join(root,'dist/assets'));
  assert.deepEqual(await checkRelease(root,{verifyDist:true}),[]);
  await put('dist/models/renamed/weights.bin','model');
  assert.ok((await checkRelease(root,{verifyDist:true})).includes('EXCLUDED_MODEL_ASSET:dist/models/renamed'));
  await rm(path.join(root,'dist/models'),{recursive:true,force:true});
  for(const name of ['person.worker-hidden.js','pet.worker-hidden.js','native.worker-hidden.js','renamed.wasm','hidden.onnx']){
   await put(`dist/assets/${name}`,'');
   assert.ok((await checkRelease(root,{verifyDist:true})).includes(`EXCLUDED_MODEL_RUNTIME:${name}`));
   await rm(path.join(root,'dist/assets',name));
  }
  await put('dist/assets/index.js','import "@vladmandic/face-api"');
  assert.ok((await checkRelease(root,{verifyDist:true})).includes('EXCLUDED_MODEL_CODE:index.js'));
 }finally{await rm(root,{recursive:true,force:true});}
});
