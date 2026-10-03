import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
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
  for (let attempts = 0; attempts < 120; attempts++) {
    // Cold startup on a freshly booted emulator can precede process creation.
    // A missing PID is expected until Android finishes launching the activity.
    const pid = await adb('shell', 'pidof', appId).catch(error => {
      if (error.code === 1 && !error.stdout?.trim()) return '';
      throw error;
    });
    const socket = `webview_devtools_remote_${pid}`;
    if (pid && (await adb('shell', 'cat', '/proc/net/unix')).includes(socket)) {
      await adb('forward', 'tcp:9222', `localabstract:${socket}`);
      const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
      const context = browser.contexts()[0];
      context.setDefaultTimeout(45_000);
      const page = context.pages()[0] ?? await context.waitForEvent('page');
      await page.locator('main.app').waitFor();
      return { browser, page };
    }
    await pause(500);
  }
  throw new Error('Android WebView debugging socket was not available.');
}
async function startApp() {
  const started = await adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
  await writeFile(join(output, 'activity-start.txt'), started);
  assert.ok(!/Error:|Status:\s*(?:timeout|error)/i.test(started), started);
}
async function nativeTree() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/window.xml');
  const xml = await adb('shell', 'cat', '/sdcard/window.xml');
  await writeFile(join(output, 'native-picker.xml'), xml);
  return xml;
}
async function tapNative(label, timeout = 15_000) {
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

let browser;
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
  let connection = await connect(); browser = connection.browser;
  let page = connection.page;
  await page.evaluate(() => localStorage.setItem('geuruteogi.first-run-completed-v1', 'true'));
  await page.reload();
  await expect(page.getByRole('heading', { name:'홈', exact:true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'android');
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__?.invoke)), true);
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'사진·영상 가져오기', exact:true }).click();
  let dialog = page.getByRole('dialog', { name:'사진·영상 가져오기', exact:true });
  await expect(dialog).toContainText('앱에 복사해 보관해요');
  // Use the real Android document picker and the real Rust/Channel pipeline.
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByRole('checkbox', { name:/가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('안드로이드에서 담은 추억');
  await page.evaluate(() => {
    const internals = window.__TAURI_INTERNALS__;
    const transform = internals.transformCallback;
    window.androidImportUpdates = [];
    internals.transformCallback = (callback, once) => transform.call(internals, message => {
      if (message?.message?.phase) window.androidImportUpdates.push(message.message);
      callback(message);
    }, once);
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
  await browser.close(); browser = undefined;
  await adb('shell', 'am', 'force-stop', appId);
  await startApp();
  connection = await connect(); browser = connection.browser; page = connection.page;
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'))).length, 2);
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_albums')))[0].title, '안드로이드에서 담은 추억');
  console.log('Android installation, real folder picker/content URI copying, byte progress, SQLite persistence and back navigation: OK');
} catch (error) {
  await writeFile(join(output, 'logcat.txt'), await adb('logcat', '-d', '-t', '5000')).catch(() => {});
  await writeFile(join(output, 'crashes.txt'), await adb('logcat', '-b', 'crash', '-d')).catch(() => {});
  await adb('shell', 'screencap', '-p', '/sdcard/failure.png').catch(() => {});
  await adb('pull', '/sdcard/failure.png', join(output, 'failure.png')).catch(() => {});
  throw error;
} finally { if (browser) await browser.close(); }
