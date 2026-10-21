// Run once on the owner's development PC, never in Actions or a disposable runner.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredCertificate, policy } from './android-signing.mjs';

const repository = 'HyeSeong123/newAlbum';
const branch = 'feature/gamjassak-audit-refactor';
const project = fileURLToPath(new URL('../', import.meta.url));
async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function inside(parent, file) {
  const relative = path.relative(parent, file);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function setupSigning({ directory, env = process.env, run = spawnSync, dispatch = false }) {
  const destination = path.resolve(directory);
  if (inside(project, destination)) throw new Error('서명키는 Git 작업 폴더 밖에 보관해야 합니다.');
  if ((env.GAMJASSAK_ANDROID_STORE_PASSWORD ?? '').length < 12) throw new Error('서명키 비밀번호를 12자 이상으로 입력해 주세요.');
  const invoke = (command, args, input) => {
    const result = run(command, args, { env, input, maxBuffer: 1024 * 1024, windowsHide: true });
    if (result.status !== 0) throw new Error(`${command} 실행 실패. 키/비밀번호를 출력하지 않았습니다. 설치·로그인·권한을 확인하고 같은 키로 다시 실행해 주세요.`);
    return result.stdout ?? Buffer.alloc(0);
  };
  // Read the public enrollment record before creating a key or changing secrets.
  const variables = JSON.parse(invoke('gh', ['variable', 'list', '--repo', repository, '--json', 'name,value']).toString());
  if (!Array.isArray(variables)) throw new Error('GitHub 서명 등록 정보를 확인할 수 없습니다.');
  const enrolled = variables.find(item => item.name === policy.certificateVariable)?.value;
  const keyFile = path.join(destination, 'gamjassak-android.keystore');
  if (enrolled && !await exists(keyFile)) throw new Error('이미 등록된 키가 있습니다. 새 키를 만들지 말고 원래 개발 PC의 키 백업을 사용해 주세요.');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const script = fileURLToPath(new URL('./protect-android-signing-directory.ps1', import.meta.url));
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Directory', destination], { env, windowsHide: true });
    if (result.status !== 0) throw new Error('키 폴더의 사용자 전용 권한을 설정하지 못했습니다.');
  } else await chmod(destination, 0o700);
  const lockFile = path.join(destination, 'setup.lock');
  const lock = await open(lockFile, 'wx', 0o600);
  const keyEnv = { ...env, GAMJASSAK_ANDROID_KEY_PASSWORD: env.GAMJASSAK_ANDROID_STORE_PASSWORD };
  // Passwords are referenced by environment variable name, never argument values.
  const keytool = args => {
    const result = run('keytool', args, { env: keyEnv, maxBuffer: 1024 * 1024, windowsHide: true });
    if (result.status !== 0) throw new Error('keytool 실행 실패. 기존 키를 덮어쓰지 않았습니다. JDK·비밀번호를 확인해 주세요.');
    return result.stdout;
  };
  try {
    if (!await exists(keyFile)) {
      keytool(['-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', keyFile,
        '-alias', 'gamjassak-android', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
        '-dname', 'CN=Gamjassak Android,O=Gamjassak,C=KR',
        '-storepass:env', 'GAMJASSAK_ANDROID_STORE_PASSWORD', '-keypass:env', 'GAMJASSAK_ANDROID_KEY_PASSWORD']);
    }
    await chmod(keyFile, 0o600);
    const certificate = keytool(['-exportcert', '-keystore', keyFile, '-alias', 'gamjassak-android', '-storepass:env', 'GAMJASSAK_ANDROID_STORE_PASSWORD']);
    if (!certificate?.length) throw new Error('서명 인증서를 읽을 수 없습니다.');
    const certificateSha256 = createHash('sha256').update(certificate).digest('hex');
    configuredCertificate({ [policy.certificateVariable]: certificateSha256 });
    if (enrolled && enrolled !== certificateSha256) throw new Error('GitHub에 등록된 서명과 다릅니다. 등록값과 기존 키를 변경하지 않았습니다.');
    const record = path.join(destination, 'certificate.json');
    if (await exists(record)) {
      const previous = JSON.parse(await readFile(record, 'utf8'));
      if (previous.certificateSha256 !== certificateSha256 || previous.packageName !== policy.packageName) throw new Error('로컬 서명 이력이 다릅니다. 키를 교체하지 않았습니다.');
    } else await writeFile(record, JSON.stringify({ packageName: policy.packageName, certificateSha256 }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const values = {
      GAMJASSAK_ANDROID_KEYSTORE_BASE64: (await readFile(keyFile)).toString('base64'),
      GAMJASSAK_ANDROID_STORE_PASSWORD: env.GAMJASSAK_ANDROID_STORE_PASSWORD,
      GAMJASSAK_ANDROID_KEY_PASSWORD: env.GAMJASSAK_ANDROID_STORE_PASSWORD,
      GAMJASSAK_ANDROID_KEY_ALIAS: 'gamjassak-android',
    };
    for (const [name, value] of Object.entries(values)) invoke('gh', ['secret', 'set', name, '--repo', repository], value);
    // Enroll last. A partial upload must not enable a build with an unknown key.
    invoke('gh', ['variable', 'set', policy.certificateVariable, '--repo', repository, '--body', certificateSha256]);
    if (dispatch) invoke('gh', ['workflow', 'run', 'android-preview.yml', '--repo', repository, '--ref', branch]);
    return { keyFile, packageName: policy.packageName, certificateSha256, workflowRequested: dispatch };
  } finally {
    delete keyEnv.GAMJASSAK_ANDROID_KEY_PASSWORD;
    await lock.close(); await rm(lockFile);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.CI || process.env.GITHUB_ACTIONS) throw new Error('영구 서명키는 CI가 아닌 소유자의 개발 PC에서 생성해야 합니다.');
    const directory = path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'Gamjassak', 'Signing');
    console.log(JSON.stringify(await setupSigning({ directory, dispatch: process.argv.includes('--build') }), null, 2));
    console.log('이 키 파일을 별도로 백업하고 비밀번호를 안전하게 보관해 주세요. 채팅·Git·아티팩트에 올리지 마세요.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { delete process.env.GAMJASSAK_ANDROID_STORE_PASSWORD; }
}
