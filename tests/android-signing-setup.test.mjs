import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSigning } from '../scripts/setup-android-signing.mjs';
import { policy } from '../scripts/android-signing.mjs';

test('owner enrollment creates a real JDK key once, registers it privately, and safely reuses it', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gamjassak-enroll-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const password = 'synthetic-test-password-never-used-for-shipping';
  const env = { ...process.env, GAMJASSAK_ANDROID_STORE_PASSWORD:password };
  const uploads = []; const keyArguments = []; let enrolled; let generations = 0; let dispatches = 0;
  const run = (command, args, options) => {
    if (command === 'keytool') {
      keyArguments.push(args);
      if (args.includes('-genkeypair')) generations++;
      return spawnSync(command, args, options);
    }
    if (command === 'powershell.exe') return spawnSync(command,args,options);
    assert.equal(command,'gh');
    if (args[0] === 'variable' && args[1] === 'list') return {status:0,stdout:Buffer.from(JSON.stringify(enrolled?[{name:policy.certificateVariable,value:enrolled}]:[]))};
    if (args[0] === 'variable' && args[1] === 'set') { enrolled=args.at(-1); return {status:0}; }
    if (args[0] === 'secret') { uploads.push({name:args[2],input:options.input,args}); return {status:0}; }
    if (args[0] === 'workflow') { dispatches++; return {status:0}; }
    throw new Error('Unexpected GitHub command');
  };
  const first=await setupSigning({directory,env,run,dispatch:true});
  assert.match(first.certificateSha256,/^[a-f0-9]{64}$/);
  assert.equal(first.packageName,policy.packageName);
  assert.equal(generations,1); assert.equal(dispatches,1); assert.equal(uploads.length,4);
  const original=await readFile(first.keyFile);
  assert.equal(uploads.find(item=>item.name.endsWith('KEYSTORE_BASE64')).input,original.toString('base64'));
  assert.equal(uploads.find(item=>item.name.endsWith('STORE_PASSWORD')).input,password);
  assert.ok(!JSON.stringify({keyArguments,result:first,arguments:uploads.map(item=>item.args)}).includes(password));
  const second=await setupSigning({directory,env,run});
  assert.equal(second.certificateSha256,first.certificateSha256); assert.equal(generations,1);
  assert.equal(createHash('sha256').update(await readFile(first.keyFile)).digest('hex'),createHash('sha256').update(original).digest('hex'));
  const before=uploads.length;
  await assert.rejects(setupSigning({directory,env:{...env,GAMJASSAK_ANDROID_STORE_PASSWORD:'wrong-password-long-enough'},run}),/keytool/);
  assert.equal(uploads.length,before);
  enrolled='f'.repeat(64);
  await assert.rejects(setupSigning({directory,env,run}),/GitHub에 등록된 서명과 다릅니다/);
  assert.equal(uploads.length,before);
  await assert.rejects(access(join(directory,'setup.lock')));
});

test('lost enrolled key, repository paths and failed metadata reads never generate or replace a key', async t => {
  const directory=await mkdtemp(join(tmpdir(),'gamjassak-enroll-missing-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const env={...process.env,GAMJASSAK_ANDROID_STORE_PASSWORD:'synthetic-test-password'};
  let calls=0;
  const enrolled=(command,args)=>{
    calls++; assert.equal(command,'gh'); assert.deepEqual(args.slice(0,2),['variable','list']);
    return {status:0,stdout:Buffer.from(JSON.stringify([{name:policy.certificateVariable,value:'a'.repeat(64)}]))};
  };
  await assert.rejects(setupSigning({directory,env,run:enrolled}),/이미 등록된 키가 있습니다/);
  assert.equal(calls,1); await assert.rejects(access(join(directory,'gamjassak-android.keystore')));
  await assert.rejects(setupSigning({directory:process.cwd(),env,run:()=>{throw new Error('must not run');}}),/Git 작업 폴더 밖/);
  await assert.rejects(setupSigning({directory,env,run:()=>({status:1,stderr:'sensitive diagnostics'})}),/gh 실행 실패/);
  await assert.rejects(access(join(directory,'gamjassak-android.keystore')));
});
