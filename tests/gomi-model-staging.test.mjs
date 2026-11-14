import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stageGomiModel} from '../scripts/prepare-gomi-action-model.mjs';

async function fixture(run) {
  const root=await mkdtemp(join(tmpdir(),'gomi-staging-'));
  try { return await run(root); } finally { await rm(root,{recursive:true,force:true}); }
}
const body=Buffer.from('test model bytes');
const spec={characterId:'gomi',usage:'home-actions',file:'gomi-action-v3.gguf',bytes:body.length,
  sha256:createHash('sha256').update(body).digest('hex')};
test('staging verifies exact model bytes and reuses valid local file without network',()=>fixture(async root=>{
  let calls=0;
  const output=await stageGomiModel(root,spec,{assetId:42},{token:'test-token',fetchImpl:async()=>{calls++;return new Response(body);}});
  assert.deepEqual(await readFile(output),body);
  await stageGomiModel(root,spec,{assetId:42},{fetchImpl:async()=>{throw Error('network should not be used');}});
  assert.equal(calls,1);
}));
test('corrupt model is rejected and partial file is removed',()=>fixture(async root=>{
  await assert.rejects(stageGomiModel(root,spec,{assetId:42},{token:'test-token',fetchImpl:async()=>new Response('wrong')}),/integrity|size/i);
  await assert.rejects(access(join(root,'models/gomi-action-v3/gomi-action-v3.gguf')));
  await assert.rejects(access(join(root,'models/gomi-action-v3/gomi-action-v3.gguf.part')));
}));
test('GitHub redirect never sends credential to asset CDN',()=>fixture(async root=>{
  const calls=[];
  await stageGomiModel(root,spec,{assetId:42},{token:'private-test-token',fetchImpl:async(url,options)=>{
    calls.push({url,headers:options.headers});
    return calls.length===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/test'}}):new Response(body);
  }});
  assert.equal(calls[0].headers.Authorization,'Bearer private-test-token');
  assert.equal(calls[1].headers.Authorization,undefined);
}));
test('unexpected redirect destination is refused',()=>fixture(async root=>{
  await assert.rejects(stageGomiModel(root,spec,{assetId:42},{token:'test-token',fetchImpl:async()=>
    new Response(null,{status:302,headers:{location:'https://example.com/private'}})}),/redirect/i);
}));
