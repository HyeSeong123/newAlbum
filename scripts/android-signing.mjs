import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const policy = JSON.parse(await readFile(new URL('./android-signing-policy.json', import.meta.url), 'utf8'));
const normalized = value => String(value ?? '').toLowerCase().replaceAll(':', '');
export function configuredCertificate(env = process.env) {
  const value = normalized(env[policy.certificateVariable]);
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('ANDROID_SIGNING_CERTIFICATE_NOT_CONFIGURED: 새 고정 서명키를 개발 PC에서 등록해 주세요.');
  if (policy.legacyCertificates.includes(value)) throw new Error('ANDROID_LEGACY_SIGNING_IDENTITY_REJECTED');
  return value;
}
export function assertFingerprint(actual, expected = configuredCertificate()) {
  if (normalized(actual) !== expected) throw new Error('ANDROID_UPDATE_CERTIFICATE_MISMATCH: 등록된 고정 서명키와 다릅니다. 키를 새로 생성하거나 기존 앱을 삭제하지 마세요.');
}
export function verifyApkSignerOutput(output, expected = configuredCertificate()) {
  const fingerprints = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9:]+)\s*$/gm)].map(match => match[1]);
  if (fingerprints.length !== 1) throw new Error('ANDROID_APK_CERTIFICATE_MISSING_OR_MULTIPLE');
  assertFingerprint(fingerprints[0], expected);
  return fingerprints[0].toLowerCase().replaceAll(':', '');
}
export function verifyApkBadging(output) {
  const fields = output.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  if (!fields || fields[1] !== policy.packageName || Number(fields[2]) < policy.minimumVersionCode) throw new Error('ANDROID_UPDATE_PACKAGE_OR_VERSION_INVALID');
  const native = output.match(/^native-code:\s*(.+)$/m)?.[1];
  const nativeAbis = [...(native || '').matchAll(/'([^']+)'/g)].map(match => match[1]);
  if (!nativeAbis.length || nativeAbis.some(abi => !['arm64-v8a', 'x86_64'].includes(abi))) throw new Error('ANDROID_UPDATE_ABI_INVALID');
  return { packageName: fields[1], versionCode: Number(fields[2]), versionName: fields[3], nativeAbis };
}
export async function prepareSigningKey(destination, env = process.env, run = spawnSync, expected = configuredCertificate(env)) {
  for (const name of ['GAMJASSAK_ANDROID_KEYSTORE_BASE64', 'GAMJASSAK_ANDROID_STORE_PASSWORD', 'GAMJASSAK_ANDROID_KEY_PASSWORD', 'GAMJASSAK_ANDROID_KEY_ALIAS']) {
    if (!env[name]?.trim()) throw new Error(`ANDROID_SIGNING_SECRET_MISSING:${name}. 원래 키를 repository secrets로 설정해야 합니다. 새 키는 생성하지 않습니다.`);
  }
  const encoded = env.GAMJASSAK_ANDROID_KEYSTORE_BASE64.trim();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('ANDROID_SIGNING_SECRET_INVALID_BASE64');
  let created = false;
  try {
    await writeFile(destination, Buffer.from(encoded, 'base64'), { mode: 0o600, flag: 'wx' });
    created = true;
    await chmod(destination, 0o600);
    const result = run('keytool', ['-exportcert', '-keystore', destination, '-storepass:env', 'GAMJASSAK_ANDROID_STORE_PASSWORD', '-alias', env.GAMJASSAK_ANDROID_KEY_ALIAS], { env, maxBuffer: 1024 * 1024 });
    if (result.status !== 0 || !result.stdout?.length) throw new Error('ANDROID_SIGNING_KEY_UNREADABLE: 원래 키와 비밀번호를 확인해 주세요.');
    const fingerprint = createHash('sha256').update(result.stdout).digest('hex');
    assertFingerprint(fingerprint, expected);
    return { certificateSha256: fingerprint };
  } catch (error) { if (created) await rm(destination, { force: true }); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, file] = process.argv.slice(2);
    if (!file) throw new Error('Signing key or APK path is required');
    if (mode === 'prepare') console.log(JSON.stringify(await prepareSigningKey(file)));
    else if (mode === 'verify-apk') {
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (!sdk) throw new Error('Android SDK path is required');
      const result = spawnSync(path.join(sdk, 'build-tools/36.0.0/apksigner'), ['verify', '--verbose', '--print-certs', file], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      if (result.status !== 0) throw new Error('ANDROID_APK_SIGNATURE_INVALID');
      const certificateSha256 = verifyApkSignerOutput(result.stdout);
      const badging = spawnSync(path.join(sdk, 'build-tools/36.0.0/aapt'), ['dump', 'badging', file], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      if (badging.status !== 0) throw new Error('ANDROID_APK_PACKAGE_UNREADABLE');
      console.log(JSON.stringify({ ...verifyApkBadging(badging.stdout), certificateSha256, apk: path.basename(file) }));
    } else throw new Error('Unknown signing check mode');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
