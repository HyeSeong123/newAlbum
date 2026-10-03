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
    await copyFile('src-tauri/android/GamjassakMediaPlugin.kt', join(root, 'src-tauri/android/GamjassakMediaPlugin.kt'));
    await mkdir(join(root, 'src-tauri/gen/android/app/src/main'), { recursive:true });
    await writeFile(join(root, 'src-tauri/gen/android/app/build.gradle.kts'), template);
    await writeFile(join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), '<manifest><application android:allowBackup="true"></application></manifest>');
    await prepareAndroid(root);
    await prepareAndroid(root);
    const manifest = await readFile(join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), 'utf8');
    assert.equal((manifest.match(/allowBackup/g) ?? []).length, 1);
    assert.match(manifest, /allowBackup="false"/);
    assert.match(await readFile(join(root, 'src-tauri/gen/android/app/src/main/java/com/oraedameun/album/GamjassakMediaPlugin.kt'), 'utf8'), /class GamjassakMediaPlugin/);
    await assert.rejects(prepareAndroid(root, true), /서명 설정이 없습니다/);
    await writeFile(join(root, 'src-tauri/gen/android/keystore.properties'), 'storeFile=private-upload-key.jks');
    await prepareAndroid(root, true);
  } finally { await rm(root, { recursive:true, force:true }); }
});
