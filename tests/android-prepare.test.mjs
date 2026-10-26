import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureGradle, prepareAndroid } from '../scripts/prepare-android.mjs';
import { androidAppId, legacyAndroidAppId, isAndroidManagedMediaPath } from '../scripts/android-app.mjs';

const template = `import java.util.Properties
android {
    compileSdk = 36
    defaultConfig { targetSdk = 36 }
    buildTypes {
        getByName("debug") { }
        getByName("release") { isMinifyEnabled = true }
    }
}`;

test('startup gallery comparison is authorized by the app command allowlist', async () => {
  const permission = await readFile(new URL('../src-tauri/permissions/album-library.toml', import.meta.url), 'utf8');
  const allowed = permission.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  assert.match(allowed, /"compare_android_gallery"/, 'the frontend startup command must be allowed before it can reach the gallery bridge');
});

test('Android location controls are authorized in the bundled main window', async () => {
  const capability = JSON.parse(await readFile(new URL('../src-tauri/capabilities/android.json', import.meta.url), 'utf8'));
  assert.ok(capability.platforms.includes('android'));
  assert.ok(capability.windows.includes('main'));
  assert.ok(capability.permissions.includes('album-library'));
  const permission = await readFile(new URL('../src-tauri/permissions/album-library.toml', import.meta.url), 'utf8');
  const allowed = new Set((permission.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/)?.[1]?.match(/"[^"]+"/g) ?? []).map(value => JSON.parse(value)));
  for (const command of ['check_android_location_setup', 'open_android_location_settings']) {
    assert.ok(allowed.has(command), `${command} must reach the Android bridge instead of being rejected by the app ACL`);
  }
});

test('GPS regression targets only the configured app managed copies and never legacy or original files', () => {
  for (const root of ['data', 'user/0']) {
    const owned = `/data/${root}/${androidAppId}/imported-media-v1/123/gps-smoke.jpg`;
    assert.ok(isAndroidManagedMediaPath(owned));
    for (const file of [
      owned.replace(androidAppId, legacyAndroidAppId),
      owned.replace(androidAppId, `${androidAppId}.other`),
      owned.replace('imported-media-v1/123', 'imported-media-v1/../123'),
      owned.replace('imported-media-v1/123', 'imported-media-v1/./123'),
      owned.replace('imported-media-v1', 'database'),
      owned + ';echo unsafe',
    ]) assert.equal(isAndroidManagedMediaPath(file), false, file);
  }
  for (const file of ['/sdcard/DCIM/gps-smoke.jpg', null, '/data/user/10/example/imported-media-v1/photo.jpg']) assert.equal(isAndroidManagedMediaPath(file), false);
});

test('Android signing is opt-in and preparing twice does not duplicate Gradle blocks', () => {
  const text = configureGradle(template);
  assert.match(text, /if \(signingFile.exists\(\)\) signingConfig/);
  assert.match(text, /getByName\("debug"\) \{ \}/);
  assert.equal(configureGradle(text), text);
  assert.throws(() => configureGradle(template.replaceAll('36', '35')), /SDK 36/);
});

test('preparation installs the bridge, excludes backups, and requires signing only for release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gamjassak-android-'));
  try {
    await mkdir(join(root, 'src-tauri/android'), { recursive:true });
    for (const file of ['GamjassakMediaPlugin.kt', 'GamjassakGalleryActivity.kt', 'GamjassakCompanionPlugin.kt', 'CompanionModelRegistry.java']) await copyFile(`src-tauri/android/${file}`, join(root, `src-tauri/android/${file}`));
    const { cp } = await import('node:fs/promises');
    await cp('src-tauri/android/companion', join(root, 'src-tauri/android/companion'), {recursive:true});
    for (const variant of ['main', 'debug']) await copyFile(`src-tauri/android/network-security-${variant}.xml`, join(root, `src-tauri/android/network-security-${variant}.xml`));
    await mkdir(join(root, 'src-tauri/gen/android/app/src/main'), { recursive:true });
    await writeFile(join(root, 'src-tauri/gen/android/app/build.gradle.kts'), template);
    await writeFile(join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), '<manifest><application android:allowBackup="true"><activity android:name=".GamjassakGalleryActivity" android:exported="false" /></application></manifest>');
    await prepareAndroid(root);
    await prepareAndroid(root);
    const manifest = await readFile(join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), 'utf8');
    assert.equal((manifest.match(/allowBackup/g) ?? []).length, 1);
    assert.match(manifest, /allowBackup="false"/);
    assert.equal((manifest.match(/networkSecurityConfig/g) ?? []).length, 1);
    assert.equal((manifest.match(/android.permission.ACCESS_MEDIA_LOCATION/g) ?? []).length, 1);
    for (const permission of ['READ_MEDIA_IMAGES','READ_MEDIA_VIDEO','READ_MEDIA_VISUAL_USER_SELECTED','READ_EXTERNAL_STORAGE']) assert.equal((manifest.match(new RegExp(`android.permission.${permission}`, 'g')) ?? []).length, 1);
    assert.match(manifest, /READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/);
    assert.equal((manifest.match(/GamjassakGalleryActivity/g) ?? []).length, 1);
    assert.match(manifest, /android:name="com\.oraedameun\.album\.GamjassakGalleryActivity" android:exported="false"/);
    assert.ok(manifest.indexOf('ACCESS_MEDIA_LOCATION') < manifest.indexOf('<application'));
    const network = await readFile(join(root, 'src-tauri/gen/android/app/src/main/res/xml/gamjassak_network_security.xml'), 'utf8');
    assert.match(network, /base-config cleartextTrafficPermitted="false"/);
    assert.match(network, /<domain>127.0.0.1<\/domain>/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/debug/res/xml/gamjassak_network_security.xml'), 'utf8'), /base-config cleartextTrafficPermitted="true"/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/main/java/com/oraedameun/album/GamjassakMediaPlugin.kt'), 'utf8'), /class GamjassakMediaPlugin/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/main/java/com/oraedameun/album/GamjassakCompanionPlugin.kt'), 'utf8'), /nativeGenerate/);
    assert.deepEqual(await readFile(join(root, 'src-tauri/gen/android/app/src/main/java/com/oraedameun/album/CompanionModelRegistry.java')), await readFile('src-tauri/android/CompanionModelRegistry.java'));
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/main/cpp/companion/CMakeLists.txt'), 'utf8'), /4d78e6aa4a9124b58dff994416525294fbab2990fe905a640d4cbd26bf563a31/);
    await assert.rejects(prepareAndroid(root, true), /서명 설정이 없습니다/);
    await writeFile(join(root, 'src-tauri/gen/android/keystore.properties'), 'storeFile=private-upload-key.jks');
    await prepareAndroid(root, true);
  } finally { await rm(root, { recursive:true, force:true }); }
});
