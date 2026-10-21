import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, stat, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { policy, configuredCertificate, assertFingerprint, verifyApkSignerOutput, verifyApkBadging, prepareSigningKey } from '../scripts/android-signing.mjs';
const env = { GAMJASSAK_ANDROID_KEYSTORE_BASE64: Buffer.from('synthetic-private-key-fixture').toString('base64'), GAMJASSAK_ANDROID_STORE_PASSWORD:'test-store-secret', GAMJASSAK_ANDROID_KEY_PASSWORD:'test-key-secret', GAMJASSAK_ANDROID_KEY_ALIAS:'test-alias' };
const publicCertificate = Buffer.from('synthetic-public-certificate');
const expected = createHash('sha256').update(publicCertificate).digest('hex');
env.GAMJASSAK_ANDROID_CERTIFICATE_SHA256 = expected;
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(),'gamjassak-sign-')); t.after(()=>rm(dir,{recursive:true,force:true})); return join(dir,'signing.keystore'); }

test('new Android identity preserves the legacy package and rejects historical signing identities', async () => {
  const { androidAppId, legacyAndroidAppId } = await import('../scripts/android-app.mjs');
  assert.equal(androidAppId, 'com.oraedameun.album.next');
  assert.equal(policy.packageName, androidAppId);
  assert.equal(legacyAndroidAppId, 'com.oraedameun.album');
  assert.notEqual(androidAppId, legacyAndroidAppId);
  assert.equal(policy.legacyInstallation.packageName, legacyAndroidAppId);
  assert.throws(()=>configuredCertificate({}),/NOT_CONFIGURED/);
  for (const cert of policy.legacyCertificates) assert.throws(()=>configuredCertificate({GAMJASSAK_ANDROID_CERTIFICATE_SHA256:cert}),/LEGACY_SIGNING/);
  assert.equal(configuredCertificate({GAMJASSAK_ANDROID_CERTIFICATE_SHA256:expected.toUpperCase().match(/../g).join(':')}),expected);
  assert.doesNotThrow(()=>assertFingerprint(expected.toUpperCase().match(/../g).join(':'),expected));
  assert.throws(()=>assertFingerprint(policy.legacyCertificates[0],expected),/CERTIFICATE_MISMATCH/);
});
test('missing or invalid secrets stop before creating a key', async t => {
  const file=await fixture(t);
  for(const name of Object.keys(env).filter(name=>name!=='GAMJASSAK_ANDROID_CERTIFICATE_SHA256')) await assert.rejects(prepareSigningKey(file,{...env,[name]:''}),/SECRET_MISSING/);
  await assert.rejects(prepareSigningKey(file,{...env,GAMJASSAK_ANDROID_KEYSTORE_BASE64:'invalid*'}),/INVALID_BASE64/);
  await assert.rejects(access(file));
});
test('private key stays owner-only and passwords never enter process arguments or reports', async t => {
  const file=await fixture(t);let args;
  const result=await prepareSigningKey(file,env,(_cmd,values)=>{args=values;return {status:0,stdout:publicCertificate};},expected);
  // Windows does not represent ACLs as POSIX mode bits. Permanent Windows keys
  // are protected and verified by the real enrollment test's ACL helper.
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode&0o777,0o600);
  assert.equal((await readFile(file)).toString(),'synthetic-private-key-fixture');
  assert.ok(args.includes('-storepass:env'));
  for(const secret of [env.GAMJASSAK_ANDROID_STORE_PASSWORD,env.GAMJASSAK_ANDROID_KEY_PASSWORD,env.GAMJASSAK_ANDROID_KEYSTORE_BASE64]) assert.ok(!JSON.stringify({args,result}).includes(secret));
  assert.deepEqual(result,{certificateSha256:expected});
});
test('wrong or unreadable keys are removed, while an existing file is preserved', async t => {
  const file=await fixture(t);
  await assert.rejects(prepareSigningKey(file,env,()=>({status:0,stdout:Buffer.from('wrong-certificate')})),/CERTIFICATE_MISMATCH/);
  await assert.rejects(access(file));
  await assert.rejects(prepareSigningKey(file,env,()=>({status:1,stderr:'sensitive tool diagnostics'})),/KEY_UNREADABLE/);
  await assert.rejects(access(file));
  await writeFile(file,'existing-key-must-survive');
  await assert.rejects(prepareSigningKey(file,env,()=>({status:0,stdout:publicCertificate})),/EEXIST/);
  assert.equal(await readFile(file,'utf8'),'existing-key-must-survive');
});
test('final APK verification requires exactly the enrolled permanent signer', () => {
  assert.equal(verifyApkSignerOutput(`Verifies\nSigner #1 certificate SHA-256 digest: ${expected}\n`,expected),expected);
  assert.throws(()=>verifyApkSignerOutput('Verifies\n',expected),/MISSING_OR_MULTIPLE/);
  assert.throws(()=>verifyApkSignerOutput(`Signer #1 certificate SHA-256 digest: ${policy.legacyCertificates[0]}\n`,expected),/CERTIFICATE_MISMATCH/);
  assert.throws(()=>verifyApkSignerOutput(`Signer #1 certificate SHA-256 digest: ${expected}\nSigner #2 certificate SHA-256 digest: ${expected}\n`,expected),/MISSING_OR_MULTIPLE/);
});
test('publishing checks the enrolled identity first and never generates or caches a replacement', async () => {
  const yaml=await readFile('.github/workflows/android-preview.yml','utf8');
  assert.ok(yaml.indexOf('Require enrolled permanent signing identity')<yaml.indexOf('Prepare SDK and Rust targets'));
  assert.ok(yaml.indexOf('node scripts/android-signing.mjs verify-apk')<yaml.indexOf('Prepare phone APK download'));
  assert.ok(yaml.indexOf('Check installed app on Android')<yaml.indexOf('Prepare phone APK download'));
  assert.doesNotMatch(yaml,/genkeypair|\.preview-keys|Preserve preview signing key/);
  assert.match(yaml,/Remove temporary signing key\r?\n\s+if: always\(\)/);
  assert.match(yaml,/--ks-pass env:GAMJASSAK_ANDROID_STORE_PASSWORD/);
});

test('APK package, increasing version code and supported ABI are checked from the actual manifest', () => {
  const badging = "package: name='com.oraedameun.album.next' versionCode='9015' versionName='0.9.15'\nnative-code: 'arm64-v8a'\n";
  assert.deepEqual(verifyApkBadging(badging), {packageName:'com.oraedameun.album.next',versionCode:9015,versionName:'0.9.15',nativeAbis:['arm64-v8a']});
  for(const value of [badging.replace('com.oraedameun.album.next','com.oraedameun.album'),badging.replace('9015','9014'),badging.replace('9015','9009'),badging.replace("native-code: 'arm64-v8a'",''),badging.replace('arm64-v8a','armeabi-v7a')]) assert.throws(()=>verifyApkBadging(value),/ANDROID_UPDATE/);
});
