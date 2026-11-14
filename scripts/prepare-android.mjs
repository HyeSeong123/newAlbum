import { copyFile, cp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function prepareGomiActionModel(projectRoot, assets) {
  const modelRoot = resolve(projectRoot, 'models/gomi-action-v3');
  let raw;
  try { raw = await readFile(resolve(modelRoot, 'runtime.json'), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A reused generated project must not silently ship a previous optional model.
    for (const file of ['gomi-action-v3.gguf', 'gomi-action-v3.json', 'gomi-action-v3-LICENSE', 'gomi-action-v3-NOTICE', 'gomi-action-v3-DERIVED-MODEL-TERMS.txt'])
      await rm(resolve(assets, file), {force:true});
    return false;
  }
  const spec = JSON.parse(raw);
  if (spec.characterId !== 'gomi' || spec.usage !== 'home-actions' || spec.file !== 'gomi-action-v3.gguf' ||
      !Number.isSafeInteger(spec.bytes) || spec.bytes < 4 || spec.bytes > 1024 ** 3 || !/^[0-9a-f]{64}$/.test(spec.sha256)) {
    throw new Error('고미 행동 모델 정책을 확인하지 못했습니다.');
  }
  const sha = createHash('sha256'); let bytes = 0;
  for await (const block of createReadStream(resolve(modelRoot, spec.file))) { bytes += block.length; sha.update(block); }
  if (bytes !== spec.bytes || sha.digest('hex') !== spec.sha256) throw new Error('고미 행동 모델 무결성 검증에 실패했습니다.');
  const license = await readFile(resolve(modelRoot, 'LICENSE'));
  const notice = await readFile(resolve(modelRoot, 'NOTICE'));
  if (!notice.toString('utf8').includes('Powered by HyperCLOVA X')) throw new Error('고미 행동 모델 필수 고지문이 없습니다.');
  await mkdir(assets, {recursive:true});
  await copyFile(resolve(modelRoot, spec.file), resolve(assets, spec.file));
  await writeFile(resolve(assets, 'gomi-action-v3-LICENSE'), license);
  await writeFile(resolve(assets, 'gomi-action-v3-NOTICE'), notice);
  try { await copyFile(resolve(modelRoot,'DERIVED-MODEL-TERMS.txt'),resolve(assets,'gomi-action-v3-DERIVED-MODEL-TERMS.txt')); }
  catch (error) { if(error.code !== 'ENOENT') throw error; }
  await writeFile(resolve(assets, 'gomi-action-v3.json'), raw);
  return true;
}

export function configureGradle(text) {
  if (!/compileSdk\s*=\s*36/.test(text) || !/targetSdk\s*=\s*36/.test(text)) {
    throw new Error('Android SDK 36 템플릿이 필요합니다. 잠금 파일의 Tauri CLI로 android:init을 다시 실행해 주세요.');
  }
  if (text.includes('// gamjassak signing')) return text;
  return text.replace('    buildTypes {', `    // gamjassak signing: secrets stay outside the repository.
    val signingFile = rootProject.file("keystore.properties")
    if (signingFile.exists()) {
        val signing = Properties().apply { signingFile.inputStream().use { load(it) } }
        signingConfigs.create("upload") {
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword", signing.getProperty("password"))
            storePassword = signing.getProperty("storePassword", signing.getProperty("password"))
            storeFile = rootProject.file(signing.getProperty("storeFile"))
        }
    }
    buildTypes {`).replace('        getByName("release") {', `        getByName("release") {
            if (signingFile.exists()) signingConfig = signingConfigs.getByName("upload")`);
}

export async function prepareAndroid(projectRoot = root, requireSigning = false) {
  const android = resolve(projectRoot, 'src-tauri/gen/android');
  const gradle = resolve(android, 'app/build.gradle.kts');
  let text;
  try { text = await readFile(gradle, 'utf8'); }
  catch { throw new Error('Android 프로젝트가 없습니다. 먼저 Android Studio·SDK·NDK·Rust를 준비하고 npm run android:init을 실행해 주세요.'); }
  if (requireSigning) {
    try { await access(resolve(android, 'keystore.properties')); }
    catch { throw new Error('Play 업로드용 서명 설정이 없습니다. docs/android.md에 따라 keystore.properties를 준비해 주세요.'); }
  }
  const configured = configureCompanionGradle(configureGradle(text));
  const adapterRoot = resolve(projectRoot, 'models/gomi-lora-v4');
  const adapterInfo = JSON.parse(await readFile(resolve(adapterRoot, 'runtime.json'), 'utf8'));
  const adapter = await readFile(resolve(adapterRoot, 'gomi-v4.gguf'));
  if (adapterInfo.file !== 'gomi-v4.gguf' || adapterInfo.characterId !== 'gomi' ||
      adapter.length !== adapterInfo.bytes || createHash('sha256').update(adapter).digest('hex') !== adapterInfo.sha256) {
    throw new Error('고미 학습 파일 무결성 검증에 실패했습니다. 원본 모델 파일을 확인해 주세요.');
  }
  const assets = resolve(android, 'app/src/main/assets/companion');
  await mkdir(assets, {recursive: true});
  await writeFile(resolve(assets, 'gomi-v4.gguf'), adapter);
  for (const file of ['LICENSE', 'NOTICE']) await copyFile(resolve(adapterRoot, file), resolve(assets, file));
  await prepareGomiActionModel(projectRoot, assets);
  const destination = resolve(android, 'app/src/main/java/com/oraedameun/album/GamjassakMediaPlugin.kt');
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(projectRoot, 'src-tauri/android/GamjassakMediaPlugin.kt'), destination);
  await copyFile(resolve(projectRoot, 'src-tauri/android/GamjassakGalleryActivity.kt'), resolve(dirname(destination), 'GamjassakGalleryActivity.kt'));
  await copyFile(resolve(projectRoot, 'src-tauri/android/GamjassakCompanionPlugin.kt'), resolve(dirname(destination), 'GamjassakCompanionPlugin.kt'));
  await copyFile(resolve(projectRoot, 'src-tauri/android/CompanionModelRegistry.java'), resolve(dirname(destination), 'CompanionModelRegistry.java'));
  await copyFile(resolve(projectRoot, 'src-tauri/android/GomiAdapter.java'), resolve(dirname(destination), 'GomiAdapter.java'));
  await copyFile(resolve(projectRoot, 'src-tauri/android/GomiActionModel.java'), resolve(dirname(destination), 'GomiActionModel.java'));
  await cp(resolve(projectRoot, 'src-tauri/android/companion'), resolve(android, 'app/src/main/cpp/companion'), { recursive: true });
  for (const variant of ['main', 'debug']) {
    const config = resolve(android, `app/src/${variant}/res/xml/gamjassak_network_security.xml`);
    await mkdir(dirname(config), { recursive: true });
    await copyFile(resolve(projectRoot, `src-tauri/android/network-security-${variant}.xml`), config);
  }
  if (configured !== text) await writeFile(gradle, configured);
  // Do not include personal photo copies/SQLite in automatic cloud backup.
  const manifest = resolve(android, 'app/src/main/AndroidManifest.xml');
  const original = await readFile(manifest, 'utf8');
  let updated = original.replace(/\sandroid:networkSecurityConfig="[^"]*"/, '').replace(/\sandroid:allowBackup="[^"]*"/, '').replace('<application', '<application android:allowBackup="false" android:networkSecurityConfig="@xml/gamjassak_network_security"');
  // Android 10+ otherwise redacts GPS even for user-selected photo documents.
  if (!updated.includes('android.permission.ACCESS_MEDIA_LOCATION')) {
    updated = updated.replace(/<manifest\b[^>]*>/, '$&\n    <uses-permission android:name="android.permission.ACCESS_MEDIA_LOCATION" />');
  }
  for (const [permission, attributes] of [
    ['READ_EXTERNAL_STORAGE', ' android:maxSdkVersion="32"'],
    ['READ_MEDIA_IMAGES', ''], ['READ_MEDIA_VIDEO', ''], ['READ_MEDIA_VISUAL_USER_SELECTED', ''],
  ]) {
    if (!updated.includes(`android.permission.${permission}"`)) updated = updated.replace(/<manifest\b[^>]*>/, `$&\n    <uses-permission android:name="android.permission.${permission}"${attributes} />`);
  }
  // The bridge keeps its Kotlin package even when the Android application ID changes.
  updated = updated.replace('android:name=".GamjassakGalleryActivity"', 'android:name="com.oraedameun.album.GamjassakGalleryActivity"');
  if (!updated.includes('com.oraedameun.album.GamjassakGalleryActivity')) updated = updated.replace('</application>', '<activity android:name="com.oraedameun.album.GamjassakGalleryActivity" android:exported="false" />\n    </application>');
  if (updated !== original) await writeFile(manifest, updated);
}

export function configureCompanionGradle(text) {
  if (text.includes('// gamjassak companion JNI')) return text;
  if (!text.includes('android {')) throw new Error('Android Gradle 설정을 확인해 주세요.');
  return text.replace('android {', `android {
    // gamjassak companion JNI: pinned llama.cpp, ARM64 Vulkan with automatic CPU fallback; base downloaded, Gomi adapter bundled.
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/companion/CMakeLists.txt")
            version = "3.22.1"
        }
    }`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await prepareAndroid(root, process.argv.includes('--require-signing')); console.log('Android SDK 36, native media bridge and signing configuration prepared.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
