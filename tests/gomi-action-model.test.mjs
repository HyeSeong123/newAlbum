import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as prepare from '../scripts/prepare-android.mjs';

test('APK-owned compact model is isolated, verifies bytes, repairs corruption and preserves user files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gomi-action-check-'));
  try {
    const compiled=spawnSync('javac',['-encoding','UTF-8','-d',root,'src-tauri/android/GomiActionModel.java','tests/fixtures/GomiActionModelChecks.java'],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stderr||compiled.error?.message);
    const run=spawnSync('java',['-cp',root,'com.oraedameun.album.GomiActionModelChecks',root],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.error?.message);
    assert.match(run.stdout,/Gomi action model checks passed/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('Android packaging stages compact GGUF and notices only after streaming integrity checks',async()=>{
  assert.equal(typeof prepare.prepareGomiActionModel,'function');
  const root=await mkdtemp(join(tmpdir(),'gomi-action-package-'));
  try {
    const assets=join(root,'assets'),model=join(root,'models/gomi-action-v3');
    await mkdir(model,{recursive:true});await mkdir(assets);
    await writeFile(join(assets,'LICENSE'),'old v4 notice');
    assert.equal(await prepare.prepareGomiActionModel(root,assets),false);
    const bytes=Buffer.from('GGUF compact model');
    const manifest={characterId:'gomi',usage:'home-actions',file:'gomi-action-v3.gguf',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    await writeFile(join(model,'runtime.json'),JSON.stringify(manifest));
    await writeFile(join(model,manifest.file),bytes);
    await writeFile(join(model,'LICENSE'),'fixture license');await writeFile(join(model,'NOTICE'),'Powered by HyperCLOVA X');
    assert.equal(await prepare.prepareGomiActionModel(root,assets),true);
    assert.deepEqual(await readFile(join(assets,manifest.file)),bytes);
    assert.deepEqual(JSON.parse(await readFile(join(assets,'gomi-action-v3.json'),'utf8')),manifest);
    assert.equal(await readFile(join(assets,'gomi-action-v3-NOTICE'),'utf8'),'Powered by HyperCLOVA X');
    assert.equal(await readFile(join(assets,'LICENSE'),'utf8'),'old v4 notice');
    const changed=Buffer.from(bytes);changed[5]^=1;await writeFile(join(model,manifest.file),changed);
    await assert.rejects(prepare.prepareGomiActionModel(root,assets),/무결성/);
    await writeFile(join(model,'runtime.json'),JSON.stringify({...manifest,file:'../escape'}));
    await assert.rejects(prepare.prepareGomiActionModel(root,assets),/정책/);
    await rm(join(model,'runtime.json'));
    assert.equal(await prepare.prepareGomiActionModel(root,assets),false);
    await assert.rejects(access(join(assets,'gomi-action-v3.json')), {code:'ENOENT'});
    await assert.rejects(access(join(assets,'gomi-action-v3.gguf')), {code:'ENOENT'});
  } finally {await rm(root,{recursive:true,force:true});}
});
