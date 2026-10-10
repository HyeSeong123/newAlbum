import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

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
  const configured = configureGradle(text);
  const destination = resolve(android, 'app/src/main/java/com/oraedameun/album/GamjassakMediaPlugin.kt');
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(projectRoot, 'src-tauri/android/GamjassakMediaPlugin.kt'), destination);
  await copyFile(resolve(projectRoot, 'src-tauri/android/GamjassakGalleryActivity.kt'), resolve(dirname(destination), 'GamjassakGalleryActivity.kt'));
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
  if (!updated.includes('.GamjassakGalleryActivity')) updated = updated.replace('</application>', '<activity android:name=".GamjassakGalleryActivity" android:exported="false" />\n    </application>');
  if (updated !== original) await writeFile(manifest, updated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await prepareAndroid(root, process.argv.includes('--require-signing')); console.log('Android SDK 36, native media bridge and signing configuration prepared.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
