import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureGradle, prepareAndroid } from '../scripts/prepare-android.mjs';

const template = `import java.util.Properties
android {
    compileSdk = 36
    defaultConfig { targetSdk = 36 }
    buildTypes {
        getByName("debug") { }
        getByName("release") { isMinifyEnabled = true }
    }
}`;

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
    for (const file of ['GamjassakMediaPlugin.kt', 'GamjassakGalleryActivity.kt']) await copyFile(`src-tauri/android/${file}`, join(root, `src-tauri/android/${file}`));
    for (const variant of ['main', 'debug']) await copyFile(`src-tauri/android/network-security-${variant}.xml`, join(root, `src-tauri/android/network-security-${variant}.xml`));
    await mkdir(join(root, 'src-tauri/gen/android/app/src/main'), { recursive:true });
    await writeFile(join(root, 'src-tauri/gen/android/app/build.gradle.kts'), template);
    await writeFile(join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), '<manifest><application android:allowBackup="true"></application></manifest>');
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
    assert.match(manifest, /android:exported="false"/);
    assert.ok(manifest.indexOf('ACCESS_MEDIA_LOCATION') < manifest.indexOf('<application'));
    const network = await readFile(join(root, 'src-tauri/gen/android/app/src/main/res/xml/gamjassak_network_security.xml'), 'utf8');
    assert.match(network, /base-config cleartextTrafficPermitted="false"/);
    assert.match(network, /<domain>127.0.0.1<\/domain>/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/debug/res/xml/gamjassak_network_security.xml'), 'utf8'), /base-config cleartextTrafficPermitted="true"/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/main/java/com/oraedameun/album/GamjassakMediaPlugin.kt'), 'utf8'), /class GamjassakMediaPlugin/);
    await assert.rejects(prepareAndroid(root, true), /서명 설정이 없습니다/);
    await writeFile(join(root, 'src-tauri/gen/android/keystore.properties'), 'storeFile=private-upload-key.jks');
    await prepareAndroid(root, true);
  } finally { await rm(root, { recursive:true, force:true }); }
});
