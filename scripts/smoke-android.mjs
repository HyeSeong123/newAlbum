import { expect } from '@playwright/test';
import { _android as android } from 'playwright';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const run = promisify(execFile);
const adb = async (...args) => (await run('adb', args, { maxBuffer:8 * 1024 * 1024 })).stdout.trim();
const output = 'test-results/android-smoke';
const appId = 'com.oraedameun.album';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function apkFiles(path) {
  const all = [];
  for (const entry of await readdir(path, { withFileTypes:true })) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) all.push(...await apkFiles(name));
    else if (entry.name.endsWith('.apk')) all.push(name);
  }
  return all;
}
async function connect() {
  // Android WebView does not support the browser-context/download overrides
  // used by a desktop Chromium CDP connection. Use Playwright's Android adapter.
  if (!device) {
    device = (await android.devices({ omitDriverInstall:true })).find(item => item.serial().startsWith('emulator-'));
    assert.ok(device, 'The Android emulator must be connected through ADB');
  }
  const webView = await device.webView({ pkg:appId }, { timeout:60_000 });
  const page = await webView.page();
  const context = page.context();
  context.setDefaultTimeout(45_000);
  const log = message => void appendFile(join(output, 'webview-console.txt'), `${message}\n`).catch(() => {});
  page.on('pageerror', error => log(error.stack ?? error.message));
  page.on('console', message => { if (message.type() === 'error') log(message.text()); });
  page.on('requestfailed', request => log(`${request.url()}: ${request.failure()?.errorText}`));
  await page.locator('main.app').waitFor();
  return { context, page };
}
async function startApp() {
  const started = await adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
  await writeFile(join(output, 'activity-start.txt'), started);
  assert.ok(!/Error:|Status:\s*(?:timeout|error)/i.test(started), started);
}
async function nativeTree() {
  const status = await adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window.xml');
  await appendFile(join(output, 'uiautomator.txt'), `${status}\n`);
  // First launch of DocumentsUI can still be loading its providers. ADB may
  // return success with "could not get idle state" and no hierarchy file.
  if (!/dumped to:/i.test(status)) return '';
  const xml = await adb('shell', 'cat', '/sdcard/window.xml');
  await writeFile(join(output, 'native-picker.xml'), xml);
  return xml;
}
async function tapNative(label, timeout = 60_000) {
  const start = Date.now();
  do {
    const nodes = (await nativeTree()).match(/<node\b[^>]+>/g) ?? [];
    const node = nodes.find(node => label.test(node));
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) { await adb('shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)), String(Math.floor((+bounds[2] + +bounds[4]) / 2))); return; }
    await pause(300);
  } while (Date.now() - start < timeout);
  throw new Error(`Native picker entry was missing: ${label}`);
}
async function downloads() {
  await tapNative(/content-desc="Show roots"/);
  await tapNative(/text="Downloads"/);
}

let device, context;
await mkdir(output, { recursive:true });
try {
  const apk = (await apkFiles('src-tauri/gen/android/app/build/outputs/apk')).find(path => /x86[_-]64/i.test(path));
  assert.ok(apk, 'x86_64 debug APK is required for the emulator');
  await adb('install', '-r', apk);
  await adb('shell', 'mkdir', '-p', '/sdcard/Download/GamjassakSmoke');
  await adb('push', resolve('tests/fixtures/pet-dog.jpg'), '/sdcard/Download/GamjassakSmoke/gamjassak-smoke.jpg');
  const video = join(output, 'large-smoke.mp4');
  await writeFile(video, Buffer.alloc(64 * 1024 * 1024, 43));
  await adb('push', resolve(video), '/sdcard/Download/GamjassakSmoke/large-smoke.mp4');
  await startApp();
  let connection = await connect(); context = connection.context;
  let page = connection.page;
  await page.evaluate(() => localStorage.setItem('geuruteogi.first-run-completed-v1', 'true'));
  await page.reload();
  await expect(page.getByRole('heading', { name:'홈', exact:true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'android');
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__?.invoke)), true);
  await page.screenshot({ path:join(output, 'initial-home.png') });
  console.log('Installed Android app launched and rendered its native home.');
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'사진·영상 가져오기', exact:true }).click();
  let dialog = page.getByRole('dialog', { name:'사진·영상 가져오기', exact:true });
  await expect(dialog).toContainText('앱에 복사해 보관해요');
  // Use the real Android document picker and the real Rust/Channel pipeline.
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByRole('checkbox', { name:/가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('안드로이드에서 담은 추억');
  await page.evaluate(() => {
    // Tauri's public functions are read-only in the real native runtime.
    // Observe its debugging callback Map without replacing native IPC behavior.
    const callbacks = window.__TAURI_INTERNALS__.callbacks;
    const set = callbacks.set.bind(callbacks);
    window.androidImportUpdates = [];
    Object.defineProperty(callbacks, 'set', { value:(id, callback) => set(id, message => {
        if (message?.message?.phase) window.androidImportUpdates.push(message.message);
        return callback(message);
      }) });
  });
  await dialog.getByRole('button', { name:'폴더 선택' }).click();
  await downloads();
  await tapNative(/text="GamjassakSmoke"/);
  await tapNative(/text="USE THIS FOLDER"/i);
  await tapNative(/text="ALLOW"/i);
  await expect(page.locator('.savedAlbumTitle')).toHaveText('안드로이드에서 담은 추억', { timeout:90_000 });
  const media = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'));
  assert.equal(media.length, 2);
  assert.ok(media.every(item => item.file_path.includes('imported-media-v1') && !item.file_path.startsWith('content://')));
  const updates = await page.evaluate(() => window.androidImportUpdates);
  assert.ok(updates.some(update => update.phase === 'copying' && update.bytesProcessed > 0));
  assert.ok(updates.some(update => update.phase === 'registering' && update.processed === 2));
  await writeFile(join(output, 'import-progress.json'), JSON.stringify(updates, null, 2));
  await page.screenshot({ path:join(output, 'installed-album.png') });
  await adb('shell', 'input', 'keyevent', '4');
  await expect(page.getByRole('heading', { name:'홈', exact:true })).toBeVisible();
  await page.screenshot({ path:join(output, 'home.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await context.close(); context = undefined;
  await adb('shell', 'am', 'force-stop', appId);
  await startApp();
  connection = await connect(); context = connection.context; page = connection.page;
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'))).length, 2);
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_albums')))[0].title, '안드로이드에서 담은 추억');
  console.log('Android installation, real folder picker/content URI copying, byte progress, SQLite persistence and back navigation: OK');
} catch (error) {
  await writeFile(join(output, 'logcat.txt'), await adb('logcat', '-d', '-t', '5000')).catch(() => {});
  await writeFile(join(output, 'crashes.txt'), await adb('logcat', '-b', 'crash', '-d')).catch(() => {});
  await adb('shell', 'screencap', '-p', '/sdcard/failure.png').catch(() => {});
  await adb('pull', '/sdcard/failure.png', join(output, 'failure.png')).catch(() => {});
  throw error;
} finally {
  if (context) await context.close();
  if (device) await device.close();
}
