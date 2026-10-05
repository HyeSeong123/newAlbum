import { expect } from '@playwright/test';
import { _android as android } from 'playwright';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { promisify } from 'node:util';
import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const run = promisify(execFile);
// A stuck emulator command must produce diagnostics instead of holding the
// whole release job indefinitely (including accessibility hierarchy dumps).
const adb = async (...args) => (await run('adb', args, { maxBuffer:8 * 1024 * 1024, timeout:60_000 })).stdout.trim();
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
async function disconnect() {
  if (context) await context.close();
  context = undefined;
  // Playwright caches WebView.page() by the process's devtools socket. A new
  // activity can reuse that socket, so discard the adapter before reconnecting.
  if (device) await device.close();
  device = undefined;
}
async function startApp() {
  const started = await adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
  await writeFile(join(output, 'activity-start.txt'), started);
  assert.ok(!/Error:|Status:\s*(?:timeout|error)/i.test(started), started);
}
async function activityRecord(label) {
  const snapshot = await adb('shell', 'dumpsys', 'activity', 'activities');
  await writeFile(join(output, `activity-${label}.txt`), snapshot);
  const record = snapshot.match(/ActivityRecord\{([0-9a-f]+) u\d+ com\.oraedameun\.album\/(?:\.|com\.oraedameun\.album\.)?MainActivity\b/);
  assert.ok(record, 'The native MainActivity must have an activity record');
  return record[1];
}
async function nativeTree() {
  const status = await adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window.xml');
  await appendFile(join(output, 'uiautomator.txt'), `${status}\n`);
  // First launch of DocumentsUI can still be loading its providers. ADB may
  // return success with "could not get idle state" and no hierarchy file.
  if (!/dumped to:/i.test(status)) return '';
  const xml = await adb('shell', 'cat', '/sdcard/window.xml');
  await writeFile(join(output, 'native-picker.xml'), xml);
  assert.ok(!xml.includes('unregistered ActivityResultLauncher'), 'Android activity result launcher was not restored');
  return xml;
}
async function nativeNode(label, timeout = 60_000) {
  const start = Date.now();
  do {
    const nodes = (await nativeTree()).match(/<node\b[^>]+>/g) ?? [];
    const node = nodes.find(node => label.test(node));
    if (node) return node;
    await pause(300);
  } while (Date.now() - start < timeout);
  throw new Error(`Native picker entry was missing: ${label}`);
}
async function tapNative(label) {
  const bounds = (await nativeNode(label)).match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds, 'Native picker control must have screen bounds');
  await adb('shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)), String(Math.floor((+bounds[2] + +bounds[4]) / 2)));
}
async function downloads() {
  // ACTION_OPEN_DOCUMENT_TREE on API 36 starts at internal storage and has
  // no roots drawer. Navigate the visible directory rather than a file-picker UI.
  await tapNative(/text="Download"/);
}
async function safeWebViewBounds() {
  console.log('Checking native WebView bounds against the Android system bars.');
  const node = await nativeNode(/class="android.webkit.WebView"/);
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(match, 'The WebView must have native screen bounds');
  const bounds = match.slice(1).map(Number);
  const sizes = [...(await adb('shell', 'wm', 'size')).matchAll(/(\d+)x(\d+)/g)];
  const height = Number(sizes.at(-1)[2]);
  assert.ok(bounds[1] > 0, 'The WebView must start below the status bar/cutout');
  assert.ok(bounds[3] < height, 'The WebView must end above the Android navigation bar');
  return bounds;
}
async function captureScreen(name) {
  await adb('shell', 'screencap', '-p', '/sdcard/gamjassak-layout.png');
  await adb('pull', '/sdcard/gamjassak-layout.png', join(output, `${name}.png`));
}

let device, context;
await mkdir(output, { recursive:true });
// Capture the guest continuously: once the emulator exits, a final `logcat -d`
// cannot retrieve the reason it stopped. Keep it independent of WebView/CDP.
const logcatFile = openSync(join(output, 'live-logcat.txt'), 'w');
const logcat = spawn('adb', ['logcat', '-b', 'all', '-v', 'threadtime'], {
  stdio:['ignore', logcatFile, logcatFile],
});
logcat.on('error', error => { void appendFile(join(output, 'logcat-start-error.txt'), String(error)); });
closeSync(logcatFile);
try {
  const apk = (await apkFiles('src-tauri/gen/android/app/build/outputs/apk')).find(path => /x86[_-]64/i.test(path));
  assert.ok(apk, 'x86_64 debug APK is required for the emulator');
  await adb('install', '-r', apk);
  await adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.threebutton');
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
  await safeWebViewBounds();
  await captureScreen('system-bars-home-threebutton');
  console.log('Installed Android app launched and rendered its native home.');
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'사진·영상 가져오기', exact:true }).click();
  let dialog = page.getByRole('dialog', { name:'사진·영상 가져오기', exact:true });
  await expect(dialog).toContainText('앱에 복사해 보관해요');
  await expect(dialog.getByRole('heading', { name:'사진·영상 가져오기', exact:true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name:'파일 선택', exact:true })).toBeInViewport();
  await captureScreen('system-bars-import-threebutton');
  // Use the real Android document picker and the real Rust/Channel pipeline.
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByRole('checkbox', { name:/가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('안드로이드에서 담은 추억');
  await dialog.getByRole('checkbox', { name:/달력에 등록하기/ }).check();
  await dialog.getByLabel('달력 등록 날짜 방식').selectOption('range');
  await dialog.getByLabel('달력 시작일').fill('2026-10-03');
  await dialog.getByLabel('달력 종료일').fill('2026-10-04');
  await expect(dialog.getByRole('heading', { name:'사진·영상 가져오기', exact:true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name:'폴더 선택', exact:true })).toBeInViewport();
  await captureScreen('system-bars-import-options-threebutton');
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
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1'))))[0].mediaIds.length, 2);
  await writeFile(join(output, 'import-progress.json'), JSON.stringify(updates, null, 2));
  console.log('Real native folder import, album creation and calendar registration completed.');
  await page.screenshot({ path:join(output, 'installed-album.png') });
  console.log('Opening the bound album in three-button navigation mode.');
  await page.getByRole('button', { name:'안드로이드에서 담은 추억 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창', exact:true });
  await expect(reader.locator('.albumBookBase')).toBeVisible();
  await captureScreen('system-bars-book-opening-threebutton');
  await writeFile(join(output, 'book-viewport.json'), JSON.stringify(await page.evaluate(() => ({
    width:innerWidth, height:innerHeight, visualHeight:visualViewport?.height,
    canvas:document.querySelector('.albumJournalCanvas').getBoundingClientRect().toJSON(),
    stage:document.querySelector('.albumBookStage').getBoundingClientRect().toJSON(),
  })), null, 2));
  const left = await reader.locator('.albumPaper.left').boundingBox();
  const right = await reader.locator('.albumPaper.right').boundingBox();
  assert.ok(Math.abs(left.y - right.y) < 1 && left.x + left.width <= right.x + 1);
  await expect(reader.getByLabel('앨범 책장 이동')).toBeInViewport();
  await captureScreen('system-bars-book-threebutton');
  console.log('Bound album and pager fit the three-button viewport; checking gesture navigation.');
  const beforeGesture = await page.evaluate(() => innerHeight);
  await adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.gestural');
  await expect.poll(() => page.evaluate(() => innerHeight)).toBeGreaterThan(beforeGesture);
  await safeWebViewBounds();
  await expect(reader.getByLabel('앨범 책장 이동')).toBeInViewport();
  await captureScreen('system-bars-book-gestural');
  await reader.getByTitle('닫기', { exact:true }).click();
  await adb('shell', 'input', 'keyevent', '4');
  await expect(page.getByRole('heading', { name:'홈', exact:true })).toBeVisible();
  await page.screenshot({ path:join(output, 'home.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const processBeforeResume = await adb('shell', 'pidof', appId);
  const activityBeforeResume = await activityRecord('before-resume');
  await disconnect();
  // Home back backgrounds the root task. Returning must keep the native
  // activity alive and its document picker and back handler usable.
  await adb('shell', 'input', 'keyevent', '4');
  await nativeNode(/package="com.google.android.apps.nexuslauncher"/);
  await startApp();
  connection = await connect(); context = connection.context; page = connection.page;
  assert.equal(await adb('shell', 'pidof', appId), processBeforeResume, 'Returning from the launcher must keep the app process alive');
  const activityAfterResume = await activityRecord('after-resume');
  assert.equal(activityAfterResume, activityBeforeResume, 'Home back must preserve the native root activity');
  await writeFile(join(output, 'warm-resume.json'), JSON.stringify({
    process:processBeforeResume, before:activityBeforeResume, after:activityAfterResume
  }, null, 2));
  await page.evaluate(() => {
    window.lifecyclePicker = { completed:false };
    window.__TAURI_INTERNALS__.invoke('choose_android_directory').then(result => {
      window.lifecyclePicker = { completed:true, cancelled:result === null };
    }).catch(error => {
      console.error(String(error));
      window.lifecyclePicker = { completed:true, error:String(error) };
    });
  });
  await nativeNode(/package="com.google.android.documentsui"/);
  for (let attempts = 0; attempts < 8; attempts++) {
    await adb('shell', 'input', 'keyevent', '4');
    await pause(800);
    if (await page.evaluate(() => window.lifecyclePicker.completed)) break;
  }
  assert.deepEqual(await page.evaluate(() => window.lifecyclePicker), { completed:true, cancelled:true });
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await adb('shell', 'input', 'keyevent', '4');
  await expect(page.getByRole('heading', { name:'홈', exact:true })).toBeVisible();
  await disconnect();
  await adb('shell', 'am', 'force-stop', appId);
  await startApp();
  connection = await connect(); context = connection.context; page = connection.page;
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'))).length, 2);
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_albums')))[0].title, '안드로이드에서 담은 추억');
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')))).length, 1);
  console.log('Android installation, system-bar bounds (three-button and gesture), import controls, bound album, real folder picker/content URI copying, byte progress, warm resume, SQLite/calendar persistence and back navigation: OK');
} catch (error) {
  console.error(error);
  await writeFile(join(output, 'failure.txt'), String(error.stack ?? error));
  const connectedDevices = await adb('devices').catch(() => 'ADB is unavailable');
  await writeFile(join(output, 'devices.txt'), connectedDevices);
  if (connectedDevices.includes('\tdevice')) {
    if (context) {
      let timer;
      await Promise.race([
        context.pages()[0]?.evaluate(() => ({ picker:window.lifecyclePicker }))
          .then(state => writeFile(join(output, 'webview-state.json'), JSON.stringify(state, null, 2))).catch(() => {}),
        new Promise(resolve => { timer = setTimeout(resolve, 3000); }),
      ]);
      clearTimeout(timer);
    }
    await adb('logcat', '-d', '-t', '5000').then(log => writeFile(join(output, 'logcat.txt'), log)).catch(() => {});
    await adb('logcat', '-b', 'crash', '-d').then(log => writeFile(join(output, 'crashes.txt'), log)).catch(() => {});
    await adb('shell', 'screencap', '-p', '/sdcard/failure.png').catch(() => {});
    await adb('pull', '/sdcard/failure.png', join(output, 'failure.png')).catch(() => {});
  }
  throw error;
} finally {
  logcat.kill();
  await disconnect();
}
