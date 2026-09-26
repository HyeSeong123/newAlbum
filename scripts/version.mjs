import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const manifestVersion = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/;
const lockVersion = /(\[\[package\]\]\r?\nname = "oraedameun"\r?\nversion = ")([^"]+)(")/;

async function readVersions(root) {
  const texts = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(resolve(root, file), 'utf8')])));
  const pkg = JSON.parse(texts['package.json']);
  const lock = JSON.parse(texts['package-lock.json']);
  const versions = [pkg.version, lock.version, lock.packages?.['']?.version,
    JSON.parse(texts['src-tauri/tauri.conf.json']).version,
    texts['src-tauri/Cargo.toml'].match(manifestVersion)?.[2],
    texts['src-tauri/Cargo.lock'].match(lockVersion)?.[2]];
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)
      || versions.some(version => version !== pkg.version)) {
    throw new Error(`버전 파일이 일치하지 않습니다: ${versions.join(', ')}. 다섯 파일의 버전을 먼저 맞춰 주세요.`);
  }
  return { texts, pkg, lock, version: pkg.version };
}

export async function checkVersion(root, tag) {
  const { version } = await readVersions(root);
  if (tag && tag !== `v${version}`) throw new Error(`태그 ${tag}와 앱 버전 v${version}이 일치하지 않습니다.`);
  return version;
}

export async function bumpVersion(root, kind) {
  if (!['patch', 'minor', 'major'].includes(kind)) throw new Error('patch, minor, major 중 하나를 지정해 주세요.');
  const { texts, pkg, lock, version } = await readVersions(root);
  const parts = version.split('.').map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[kind];
  parts[index]++;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  const next = parts.join('.');
  pkg.version = lock.version = lock.packages[''].version = next;
  texts['package.json'] = `${JSON.stringify(pkg, null, 2)}\n`;
  texts['package-lock.json'] = `${JSON.stringify(lock, null, 2)}\n`;
  texts['src-tauri/tauri.conf.json'] = texts['src-tauri/tauri.conf.json'].replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
  texts['src-tauri/Cargo.toml'] = texts['src-tauri/Cargo.toml'].replace(manifestVersion, `$1${next}$3`);
  texts['src-tauri/Cargo.lock'] = texts['src-tauri/Cargo.lock'].replace(lockVersion, `$1${next}$3`);
  // Validate all inputs before changing any of the version files. Git remains explicit.
  for (const file of files) await writeFile(resolve(root, file), texts[file]);
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const command = process.argv[2];
    if (command === '--check') {
      const tag = process.argv[3] || (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
      console.log(await checkVersion(root, tag));
    } else {
      const version = await bumpVersion(root, command);
      console.log(`버전을 ${version}(으)로 맞췄습니다. 변경사항을 커밋한 뒤 v${version} 태그를 푸시하면 설치 파일을 빌드합니다.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
