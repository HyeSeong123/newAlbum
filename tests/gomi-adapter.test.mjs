import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

test('runtime adapter is the recorded conversion of the trained4B weights', async()=>{
  const root = new URL('../models/gomi-lora-v4/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('runtime.json', root), 'utf8'));
  const bytes = await readFile(new URL(manifest.file, root));
  const source = await readFile(new URL('adapter_model.safetensors', root));
  assert.equal(bytes.subarray(0,4).toString(), 'GGUF');
  assert.equal(Number(bytes.readBigUInt64LE(8)), 288);
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  assert.equal(createHash('sha256').update(source).digest('hex'), manifest.sourceAdapterSha256);
  assert.equal(manifest.characterId, 'gomi');
  assert.equal(manifest.baseModelSha256, '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597');
  const java = await readFile(new URL('../src-tauri/android/GomiAdapter.java', import.meta.url), 'utf8');
  assert.ok(java.includes(manifest.sha256));
  assert.ok(java.includes(`${manifest.bytes}L`));
});

test('native policy scopes Gomi4B, verifies/reuses/repairs files and rejects corrupt assets', async t=>{
  const compiler = spawnSync('javac', ['-version'], {encoding:'utf8'});
  if(compiler.error?.code==='ENOENT') return t.skip('JDK compiler required; CI runs this with JDK17');
  assert.equal(compiler.status,0,compiler.stderr);
  const root = await mkdtemp(join(tmpdir(),'gomgomi-adapter-check-'));
  try {
    const compiled = spawnSync('javac',['-encoding','UTF-8','-d',root,'src-tauri/android/GomiAdapter.java','tests/fixtures/GomiAdapterChecks.java'],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stderr);
    const checked = spawnSync('java',['-cp',root,'com.oraedameun.album.GomiAdapterChecks',resolve('models/gomi-lora-v4/gomi-v4.gguf'),root],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr);
    assert.match(checked.stdout,/Gomi adapter checks passed/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));
    await rm(root,{recursive:true,force:true});
  }
});
