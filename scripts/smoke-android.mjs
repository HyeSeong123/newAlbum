import { verifyInstalledPersonRuntime } from './person-runtime-benchmark.mjs';
import { verifyInstalledGallery } from './gallery-smoke.mjs';
import { verifyInstalledRepetitionMeasurement } from './person-repetition-smoke.mjs';
import { expect } from '@playwright/test';
import { _android as android } from 'playwright';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { promisify } from 'node:util';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { benchmarkInstalledPetRuntime, verifyInstalledCatFace } from './pet-runtime-benchmark.mjs';

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
  const firstPage = await webView.page();
  const context = firstPage.context();
  context.setDefaultTimeout(45_000);
  // Android can retain the detached WebView's CDP target after recreation.
  // page() returns the first target, which can still contain the old book.
  // Every connection here starts at the native home; pick its current app page.
  let page;
  await expect.poll(async () => {
    for (const candidate of context.pages().reverse()) {
      if (await candidate.locator('main.app .navList').isVisible().catch(() => false)) {
        page = candidate;
        return true;
      }
    }
    return false;
  }, { timeout:60_000 }).toBe(true);
  await appendFile(join(output, 'webview-targets.jsonl'), JSON.stringify(await Promise.all(context.pages().map(async candidate => ({
    url:candidate.url(), selected:candidate === page,
    state:await candidate.evaluate(() => ({ visible:document.visibilityState, focused:document.hasFocus(), book:Boolean(document.querySelector('.albumJournal')) })).catch(() => null),
  })))) + '\n');
  const log = message => void appendFile(join(output, 'webview-console.txt'), `${message}\n`).catch(() => {});
  page.on('pageerror', error => log(error.stack ?? error.message));
  page.on('console', message => { if (message.type() === 'error' || message.text().startsWith('Pet inference diagnostics:')) log(message.text()); });
  page.on('requestfailed', request => log(`${request.url()}: ${request.failure()?.errorText}`));
  await page.locator('main.app').waitFor();
  const capturePetDiagnostics = () => {
    if (window.petDiagnosticListener) return;
    window.petDiagnosticListener = true;
    window.petDiagnostics = [];
    window.addEventListener('gamjassak-pet-diagnostics', event => {
      window.petDiagnostics.push(event.detail);
      console.log('Pet inference diagnostics: ' + JSON.stringify(event.detail));
    });
  };
  await page.addInitScript(capturePetDiagnostics);
  await page.evaluate(capturePetDiagnostics);
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
  // Permission sheets can still be sliding while uiautomator reports their
  // controls. A coordinate from that frame can miss the settled button. Wait
  // for two matching snapshots, rather than treating a dispatched tap as a click.
  let previous;
  const deadline = Date.now() + 60_000;
  do {
    const bounds = (await nativeNode(label)).match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(bounds, 'Native picker control must have screen bounds');
    if (previous === bounds[0]) {
      await adb('shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)), String(Math.floor((+bounds[2] + +bounds[4]) / 2)));
      return;
    }
    previous = bounds[0];
    await pause(300);
  } while (Date.now() < deadline);
  throw new Error(`Native picker control did not settle: ${label}`);
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
async function keyboardSafeWebView(before) {
  const nodes = (await nativeTree()).match(/<node\b[^>]+>/g) ?? [];
  const bounds = node => node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
  // uiautomator dump exposes the active application tree, not the IME window.
  // Compare the native WebView before and after focusing a real text field,
  // independently of the browser viewport metrics used by the CSS assertions.
  const webView = bounds(nodes.find(node => /class="android.webkit.WebView"/.test(node)));
  assert.ok(webView, 'The keyboard layout check must include the native WebView');
  assert.ok(webView[3] < before[3] - 100, 'The native WebView must shrink above the keyboard when typing');
  await writeFile(join(output, 'keyboard-bounds.json'), JSON.stringify({ before, withKeyboard:webView }, null, 2));
}
async function loadedAlbumPhoto(reader) {
  const photos = reader.locator('.albumPagePhoto img.mediaImage');
  await expect(photos).toHaveCount(1);
  // Native file URLs are asynchronous. A visible <img> or book background
  // alone does not prove the imported photo decoded after activity recreation.
  await expect.poll(() => photos.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), { timeout:45_000 }).toBe(true);
  await reader.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function checkVideoPlayback(page, label) {
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'large-smoke.mp4 상세보기', exact:true }).click();
  const detail = page.getByRole('dialog', { name:'사진 상세', exact:true });
  const video = detail.locator('video');
  await expect(video).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:\d+\//);
  await expect.poll(() => video.evaluate(el => el.readyState), { timeout:45_000 }).toBeGreaterThanOrEqual(2);
  assert.ok(await video.evaluate(el => el.duration > 9 && el.error === null));
  await video.evaluate(el => el.play());
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(.5);
  await video.evaluate(el => { el.pause(); el.currentTime = 6; });
  await expect.poll(() => video.evaluate(el => !el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - 6) < .2)).toBe(true);
  await video.evaluate(el => el.play());
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(6.5);
  const result = await video.evaluate(async el => {
    el.pause();
    const response = await fetch(el.src, { headers:{ Range:'bytes=65536-65567' } });
    return { duration:el.duration, currentTime:el.currentTime, readyState:el.readyState,
      decodedFrames:el.getVideoPlaybackQuality().totalVideoFrames, error:el.error?.code ?? null,
      rangeStatus:response.status, range:response.headers.get('Content-Range'), rangeBytes:(await response.arrayBuffer()).byteLength };
  });
  assert.equal(result.rangeStatus, 206); assert.equal(result.rangeBytes, 32);
  assert.equal(result.range, 'bytes 65536-65567/67108864');
  assert.ok(result.decodedFrames > 0);
  await writeFile(join(output, `video-playback-${label}.json`), JSON.stringify(result, null, 2));
  await captureScreen(`video-playback-${label}`);
  const player = await video.elementHandle();
  await detail.getByTitle('닫기', { exact:true }).click();
  assert.equal(await player.evaluate(el => el.paused), true);
  await page.locator('.navList').getByRole('button', { name:'내 앨범', exact:true }).click();
  console.log(`Actual MP4 playback, decoded frames, byte ranges and seeking (${label}): OK`);
}

async function checkPhotoGps(page) {
  console.log('Checking real Android photo GPS redaction, permission and reimport recovery.');
  // With visual-media permissions declared, Android can suppress the separate
  // location sheet until photo access exists. Set a real denied permission
  // state instead of requiring a dialog that the OS may never display.
  await adb('shell', 'pm', 'revoke', appId, 'android.permission.ACCESS_MEDIA_LOCATION');
  await adb('shell', 'pm', 'set-permission-flags', appId, 'android.permission.ACCESS_MEDIA_LOCATION', 'user-set', 'user-fixed');
  await adb('shell', 'mkdir', '-p', '/sdcard/Download/GamjassakGPS');
  await adb('push', resolve('tests/fixtures/exif-seoul.jpg'), '/sdcard/Download/GamjassakGPS/gps-smoke.jpg');
  await adb('push', resolve('tests/fixtures/no-gps.jpg'), '/sdcard/Download/GamjassakGPS/no-gps-smoke.jpg');
  for (const file of ['gps-smoke.jpg', 'no-gps-smoke.jpg']) {
    await adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Download/GamjassakGPS/${file}`);
  }
  await expect.poll(async () => {
    const rows = (await adb('shell', 'content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_display_name')).split('\n');
    // Both documents must be indexed. The GPS filename is also a substring of
    // the GPS-free filename, so a substring check could race the real scanner.
    return ['gps-smoke.jpg', 'no-gps-smoke.jpg'].every(name => rows.some(row => row.trim().endsWith(`_display_name=${name}`)));
  }).toBe(true);
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'사진·영상 가져오기', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'사진·영상 가져오기', exact:true });
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByRole('button', { name:'폴더 선택', exact:true }).click();
  await downloads();
  await tapNative(/text="GamjassakGPS"/);
  await tapNative(/text="USE THIS FOLDER"/i);
  await tapNative(/text="ALLOW"/i);
  await expect(page.locator('.mediaTile')).toHaveCount(2, { timeout:60_000 });
  await expect(page.locator('.selectionNotice')).toContainText('사진 위치정보 권한이 꺼져', { timeout:60_000 });
  let rows = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'));
  const selected = rows.find(item => item.file_path.endsWith('gps-smoke.jpg') && !item.file_path.endsWith('no-gps-smoke.jpg'));
  const gpsFree = rows.find(item => item.file_path.endsWith('no-gps-smoke.jpg'));
  assert.ok(selected && gpsFree);
  assert.match(await adb('shell', 'dumpsys', 'package', appId), /android\.permission\.ACCESS_MEDIA_LOCATION: granted=false/);
  assert.equal(gpsFree.latitude, null); assert.equal(gpsFree.gps_region_code, null);
  // A SAF provider can expose original bytes through the explicit document
  // grant even when MediaStore location access is denied. Preserve valid GPS.
  if (selected.latitude !== null) {
    assert.ok(Math.abs(selected.latitude - 37.56638888) < .00001);
    assert.equal(selected.gps_region_code, 'KR-11');
  }
  await captureScreen('gps-permission-denied');
  // Reproduce an older app's GPS-free managed copy independently of provider
  // redaction. Change only these synthetic app-owned copies, never the source.
  for (const file of [selected, gpsFree]) {
    assert.match(file.file_path, /^\/data\/(?:user\/0|data)\/com\.oraedameun\.album\/[A-Za-z0-9_./-]+$/);
    assert.ok(file.file_path.includes('/imported-media-v1/'));
  }
  await adb('shell', 'run-as', appId, 'cp', gpsFree.file_path, selected.file_path);
  rows = await page.evaluate(path => window.__TAURI_INTERNALS__.invoke('register_paths', { paths:[path] }), selected.file_path);
  const denied = rows.find(item => item.id === selected.id);
  assert.ok(denied);
  assert.equal(denied.latitude, null); assert.equal(denied.gps_region_code, null);
  // Android can zero GPS tags instead of removing their IFD. The parser then
  // reports unreadable GPS; neither state may expose coordinates or a region.
  assert.ok(['no-gps', 'failed'].includes(denied.location_status));
  // Model recovery through Android settings, after a permanent denial. Keep
  // the original SAF grant and do not grant broad gallery access for this test.
  await adb('shell', 'pm', 'clear-permission-flags', appId, 'android.permission.ACCESS_MEDIA_LOCATION', 'user-set', 'user-fixed');
  await adb('shell', 'pm', 'grant', appId, 'android.permission.ACCESS_MEDIA_LOCATION');
  assert.match(await adb('shell', 'dumpsys', 'package', appId), /android\.permission\.ACCESS_MEDIA_LOCATION: granted=true/);
  await page.evaluate(async id => {
    await window.__TAURI_INTERNALS__.invoke('update_media_details', { id, rating:4, comment:'GPS 복구 확인', favorite:true });
    window.gpsRecovery = { completed:false };
    window.gpsRecoveryProgress = [];
    const channel = window.__TAURI_INTERNALS__.transformCallback(message => window.gpsRecoveryProgress.push(message));
    // Reuse the real tree grant selected above; no broad gallery permission.
    window.__TAURI_INTERNALS__.invoke('register_paths', {
      paths:['content://com.android.externalstorage.documents/tree/primary%3ADownload%2FGamjassakGPS'], progress:`__CHANNEL__:${channel}`,
    }).then(rows => { window.gpsRecovery = { completed:true, rows }; })
      .catch(error => { window.gpsRecovery = { completed:true, error:String(error) }; });
  }, denied.id);
  await expect.poll(() => page.evaluate(() => window.gpsRecovery.completed), { timeout:60_000 }).toBe(true);
  const recovery = await page.evaluate(() => window.gpsRecovery);
  const permission = (await adb('shell', 'dumpsys', 'package', appId)).split('\n').filter(line => /ACCESS_MEDIA_LOCATION|READ_MEDIA/.test(line));
  console.log('GPS recovery diagnostics:', JSON.stringify({ recovery, progress:await page.evaluate(() => window.gpsRecoveryProgress), permission }));
  assert.equal(recovery.error, undefined);
  rows = recovery.rows;
  assert.equal(rows.length, 2);
  const located = rows.find(item => item.id === denied.id);
  assert.ok(Math.abs(located.latitude - 37.56638888) < .00001);
  assert.ok(Math.abs(located.longitude - 126.97805555) < .00001);
  assert.equal(located.location_status, 'ready');
  assert.equal(located.gps_region_code, 'KR-11');
  assert.ok(located.district);
  assert.equal(located.rating, 4); assert.equal(located.comment, 'GPS 복구 확인'); assert.equal(located.favorite, true);
  const absent = rows.find(item => item.file_path.endsWith('no-gps-smoke.jpg'));
  assert.equal(absent.latitude, null); assert.equal(absent.location_status, 'no-gps');
  await writeFile(join(output, 'gps-recovery.json'), JSON.stringify({ selectedWithDeniedPermission:selected, legacyCopy:denied, located, absent }, null, 2));
  await page.reload();
  // The first real Seoul GPS record unlocks a regional character. Dismiss the
  // actual notification before checking the photo's location in the UI.
  const discovery = page.locator('.characterModal');
  await expect(discovery).toBeVisible();
  await discovery.getByRole('button', { name:'나중에 보기', exact:true }).click();
  await expect(page.locator('.characterModalBackdrop')).toHaveCount(0);
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'gps-smoke.jpg 상세보기', exact:true }).click();
  const detail = page.getByRole('dialog', { name:'사진 상세', exact:true });
  await expect(detail.locator('.regionEditor')).toContainText('서울특별시');
  await captureScreen('gps-original-restored');
  await detail.getByTitle('닫기', { exact:true }).click();
  await page.evaluate(ids => window.__TAURI_INTERNALS__.invoke('delete_registered_media', { ids }), rows.map(item => item.id));
  await page.reload();
  console.log('Denied permission keeps photos usable; allowing recovers original GPS with the same IDs/edits; GPS-free photo stays unclassified: OK');
  return located.file_path.split('/imported-media-v1/')[0];
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
  const fixture = await readFile('tests/fixtures/playback.mp4');
  const padded = Buffer.alloc(64 * 1024 * 1024);
  fixture.copy(padded);
  // A valid MP4 free box preserves the large-file import/progress regression.
  padded.writeUInt32BE(padded.length - fixture.length, fixture.length);
  padded.write('free', fixture.length + 4);
  await writeFile(video, padded);
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
  await page.getByRole('button', { name:'고미 도움말 열기', exact:true }).click();
  const gomiGuide = page.getByRole('dialog', { name:'고미 도움말', exact:true });
  await expect(gomiGuide.locator('.gomiGuideSpeech')).toHaveText('…휴. 사진은 직접 골라.');
  await expect(gomiGuide.locator('.gomiGuideStep p')).toHaveText(/^…가져오기부터\./);
  await expect(gomiGuide.locator('.characterVisual')).toHaveAttribute('data-expression', 'cynical');
  await expect.poll(() => gomiGuide.locator('img').evaluate(el => el.complete && el.naturalWidth === 1254)).toBe(true);
  await captureScreen('gomi-cynical-guide');
  await gomiGuide.getByRole('button', { name:'인물 등록', exact:true }).click();
  await expect(gomiGuide.locator('.gomiGuideStep p')).toHaveText(/^…사람 탭\./);
  await gomiGuide.getByRole('button', { name:'다음', exact:true }).click();
  await expect(gomiGuide.locator('.gomiGuideStep p')).toHaveText(/^…네가 확인해\./);
  await captureScreen('gomi-varied-help');
  await gomiGuide.getByRole('button', { name:'도움말 닫기', exact:true }).click();
  const gomiState = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('sync_characters'));
  assert.equal(gomiState.characters.find(character => character.id === 'gomi').affection, 0);
  console.log('Gomi cynical art, cold low-affection help and no guide affection award: OK');
  console.log('Installed Android app launched and rendered its native home.');
  const appDataRoot=await checkPhotoGps(page);
  await verifyInstalledGallery({page,adb,nativeTree,tapNative,captureScreen,output});
  const security=await page.evaluate(async root=>{
    const violations=[];const listener=event=>violations.push(event.effectiveDirective);
    window.addEventListener('securitypolicyviolation',listener);
    const script=document.createElement('script');script.textContent='window.__personCspProbe=true';document.body.append(script);script.remove();
    await fetch('https://example.invalid/gamjassak-csp-probe').catch(()=>undefined);
    await new Promise(resolve=>setTimeout(resolve,100));window.removeEventListener('securitypolicyviolation',listener);
    const db=await fetch(window.__TAURI_INTERNALS__.convertFileSrc(root+'/album.sqlite')).then(response=>response.status).catch(()=>0);
    return {externalNetworkBlocked:violations.includes('connect-src'),inlineScriptBlocked:!window.__personCspProbe&&violations.some(v=>v.startsWith('script-src')),databaseAssetBlocked:db!==200};
  },appDataRoot);
  assert.equal(security.externalNetworkBlocked,true);assert.equal(security.inlineScriptBlocked,true);assert.equal(security.databaseAssetBlocked,true);
  await writeFile(join(output,'person-security-smoke.json'),JSON.stringify(security,null,2));
  console.log('Android CSP and SQLite asset access controls: '+JSON.stringify(security));
  await expect(page.getByRole('button', { name:'다음 메뉴 보기', exact:true })).toBeEnabled();
  await page.getByRole('button', { name:'다음 메뉴 보기', exact:true }).click();
  await expect.poll(() => page.locator('.navList').evaluate(element => element.scrollLeft)).toBeGreaterThan(20);
  await expect(page.getByRole('button', { name:'이전 메뉴 보기', exact:true })).toBeEnabled();
  await captureScreen('mobile-navigation-arrows');
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.getByRole('button', { name:'사진·영상 가져오기', exact:true }).click();
  let dialog = page.getByRole('dialog', { name:'사진·영상 가져오기', exact:true });
  await expect(dialog).toContainText('앱에 복사해 보관해요');
  await expect(dialog.getByRole('heading', { name:'사진·영상 가져오기', exact:true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name:'갤러리 열기', exact:true })).toBeInViewport();
  await captureScreen('system-bars-import-threebutton');
  // Keep this import and pet inference offline; every model must be in the APK.
  await adb('shell','svc','wifi','disable');
  await adb('shell','svc','data','disable');
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
  await checkVideoPlayback(page, 'imported');
  console.log('Opening the single-page album in three-button navigation mode.');
  await page.getByRole('button', { name:'안드로이드에서 담은 추억 앨범 열기', exact:true }).click();
  let reader = page.getByRole('dialog', { name:'앨범 전체창', exact:true });
  await expect(reader.locator('.albumBookBase')).toBeVisible();
  await loadedAlbumPhoto(reader);
  await captureScreen('system-bars-book-opening-threebutton');
  await writeFile(join(output, 'book-viewport.json'), JSON.stringify(await page.evaluate(() => ({
    width:innerWidth, height:innerHeight, visualHeight:visualViewport?.height,
    canvas:document.querySelector('.albumJournalCanvas').getBoundingClientRect().toJSON(),
    stage:document.querySelector('.albumBookStage').getBoundingClientRect().toJSON(),
  })), null, 2));
  await expect(reader.locator('.albumPaper')).toHaveCount(1);
  await expect(reader.locator('.albumPagerActions p')).toHaveText(/페이지$/);
  const leaf = await reader.locator('.albumPaper').boundingBox();
  assert.ok(leaf.height > leaf.width, 'The mobile book leaf must have portrait proportions');
  await expect(reader.getByLabel('앨범 책장 이동')).toBeInViewport();
  await captureScreen('system-bars-book-threebutton');
  for (const kind of ['챕터', '편지']) {
    const height = await page.evaluate(() => innerHeight);
    await reader.getByRole('button', { name:`${kind}+`, exact:true }).click();
    const writing = page.getByRole('dialog', { name:`${kind} 상세`, exact:true });
    await expect(writing).toBeVisible();
    assert.equal(await page.evaluate(() => document.activeElement.matches('input,textarea')), false);
    assert.equal(await page.evaluate(() => innerHeight), height);
    const picker = await writing.getByLabel('앨범 장 선택', { exact:true }).boundingBox();
    const title = await writing.getByLabel(`${kind} 제목`, { exact:true }).boundingBox();
    assert.ok(picker.y + picker.height <= title.y && title.width > picker.width * .9);
    await captureScreen(`horizontal-${kind === '챕터' ? 'chapter' : 'letter'}-editor`);
    await writing.getByRole('button', { name:'취소', exact:true }).click();
  }
  console.log('Single-page album and pager fit the three-button viewport; checking gesture navigation.');
  const threeButtonBounds = await safeWebViewBounds();
  // Changing this Android resource recreates MainActivity and its WebView.
  // Reconnect instead of polling the detached page's cached layout metrics.
  await disconnect();
  await adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.gestural');
  const overlays = await adb('shell', 'cmd', 'overlay', 'list');
  await writeFile(join(output, 'navigation-overlays.txt'), overlays);
  assert.ok(overlays.includes('[x] com.android.internal.systemui.navbar.gestural'), 'Gesture navigation must actually be enabled');
  await startApp();
  connection = await connect(); context = connection.context; page = connection.page;
  const gestureBounds = await safeWebViewBounds();
  await writeFile(join(output, 'navigation-bounds.json'), JSON.stringify({ threeButton:threeButtonBounds, gesture:gestureBounds }, null, 2));
  await page.locator('.navList').getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'안드로이드에서 담은 추억 앨범 열기', exact:true }).click();
  reader = page.getByRole('dialog', { name:'앨범 전체창', exact:true });
  await expect(reader.locator('.albumBookBase')).toBeVisible();
  await loadedAlbumPhoto(reader);
  await expect(reader.getByLabel('앨범 책장 이동')).toBeInViewport();
  await captureScreen('system-bars-book-gestural');
  const albumMenuTrigger = reader.getByRole('button', { name:'앨범 보기 옵션', exact:true });
  await albumMenuTrigger.click();
  await expect(page.locator('.actionMenuPanel')).toBeVisible();
  await expect(page.getByRole('button', { name:'전체화면', exact:true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const trigger = document.querySelector('.albumJournalTools .actionMenuTrigger').getBoundingClientRect();
    const menu = document.querySelector('.actionMenuPanel').getBoundingClientRect();
    return Math.min(Math.abs(menu.top - trigger.bottom - 6), Math.abs(trigger.top - menu.bottom - 6)) < 8
      && menu.left >= 9 && menu.right <= innerWidth - 9 && menu.bottom <= innerHeight - 9;
  })).toBe(true);
  await captureScreen('album-anchored-menu');
  await page.keyboard.press('Escape');
  await expect(reader).toBeVisible();
  await reader.locator('.albumPagePhoto:has(.mediaImage)').first().click();
  const photoDetail = page.getByRole('dialog', { name:'사진 상세', exact:true });
  for (const label of ['해상도', '파일 크기', '조회 수']) await expect(photoDetail.getByText(label, { exact:true })).toHaveCount(0);
  const favoriteControl = photoDetail.getByRole('button', { name:'즐겨찾기', exact:true });
  await favoriteControl.click();
  await expect(photoDetail.locator('.favoritePhotoBadge svg')).toHaveCSS('color', 'rgb(216, 62, 82)');
  await expect.poll(() => page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_media')).some(item => item.favorite))).toBe(true);
  await captureScreen('mobile-photo-favorite');
  await photoDetail.getByTitle('닫기', { exact:true }).click();
  await expect(reader.locator('.albumPaper .favoritePhotoBadge')).toBeVisible();
  console.log('Mobile navigation arrows, hidden technical photo metadata/fullscreen and red favorite badges: OK');
  await reader.locator('.albumPagePhoto:has(img.mediaImage)').first().click();
  const detail = page.getByRole('dialog', { name:'사진 상세', exact:true });
  await expect(detail).toBeVisible();
  await expect(detail.locator('.commentBox, .commentForm, .commentList')).toHaveCount(0);
  await expect(detail.getByRole('button', { name:/댓글/ })).toHaveCount(0);
  await captureScreen('photo-detail-without-comments');
  await detail.getByTitle('닫기', { exact:true }).click();
  await reader.getByTitle('닫기', { exact:true }).click();
  await page.locator('.navList').getByRole('button', { name:'일기장', exact:true }).click();
  await page.getByRole('button', { name:'첫 일기 쓰기', exact:true }).click();
  const diary = page.getByRole('dialog', { name:'새 일기', exact:true });
  await expect(diary.locator('form')).toBeFocused();
  const fullHeight = await page.evaluate(() => innerHeight);
  await diary.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await captureScreen('diary-full-frame');
  await diary.getByLabel('제목', { exact:true }).fill('휴대폰 한 화면의 일기');
  await diary.getByLabel('내용', { exact:true }).fill(Array.from({ length:100 }, (_, i) => `${i + 1}번째 줄의 안드로이드 기록`).join('\n'));
  await expect.poll(() => page.evaluate(() => innerHeight)).toBeLessThan(fullHeight - 100);
  await keyboardSafeWebView(gestureBounds);
  await expect.poll(() => diary.evaluate(element => {
    const viewport = visualViewport;
    const limit = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
    const save = element.querySelector('.diaryDialogActions').getBoundingClientRect();
    return element.getBoundingClientRect().bottom <= limit + 1 && save.bottom <= limit + 1;
  })).toBe(true);
  await captureScreen('diary-bounded-frame');
  await diary.getByRole('button', { name:'일기 저장', exact:true }).click();
  await expect(diary).toBeHidden();
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_diary'))).length, 1);
  await page.locator('.diaryCardMenu .actionMenuTrigger').first().click();
  await expect(page.locator('.actionMenuPanel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const trigger = document.querySelector('.diaryCardMenu .actionMenuTrigger').getBoundingClientRect();
    const menu = document.querySelector('.actionMenuPanel').getBoundingClientRect();
    return Math.min(Math.abs(menu.top - trigger.bottom - 6), Math.abs(trigger.top - menu.bottom - 6)) < 8
      && menu.left >= 9 && menu.right <= innerWidth - 9 && menu.bottom <= innerHeight - 9;
  })).toBe(true);
  await captureScreen('diary-anchored-menu');
  await page.getByRole('button', { name:'일기 수정', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'일기 상세', exact:true })).toBeVisible();
  await page.getByRole('dialog', { name:'일기 상세', exact:true }).getByRole('button', { name:'닫기', exact:true }).click();
  console.log('Diary frame and save actions fit the Android visual viewport; long text saved through native storage.');
  await page.locator('.navList').getByRole('button', { name:'사람과 반려동물', exact:true }).click();
  await expect(page.locator('.peopleView > .entityHeader')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await captureScreen('people-controls-overview');
  await page.getByRole('tab', { name:'반려동물', exact:true }).click();
  await page.getByRole('button', { name:'반려동물 등록', exact:true }).click();
  const petEditor = page.getByRole('dialog', { name:'반려동물 등록', exact:true });
  await petEditor.getByLabel('이름', { exact:true }).fill('안드로이드 보리');
  await petEditor.getByRole('button', { name:'사진 선택', exact:true }).first().click();
  await petEditor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(petEditor).toBeHidden();
  const petHeader = page.locator('.petsView > .entityHeader');
  await expect(petHeader.getByRole('heading', { name:'안드로이드 보리', exact:true })).toBeVisible();
  await expect(petHeader.getByText('사진 1장', { exact:true })).toBeVisible();
  assert.equal(await petHeader.evaluate(element => {
    const heading = element.querySelector('.entityHeading').getBoundingClientRect();
    const actions = element.querySelector('.entityActions').getBoundingClientRect();
    return heading.right < actions.left && actions.right <= innerWidth;
  }), true);
  await petHeader.getByRole('button', { name:'반려동물 관리', exact:true }).click();
  await expect(page.locator('.actionMenuPanel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const trigger = document.querySelector('.petsView .actionMenuTrigger').getBoundingClientRect();
    const menu = document.querySelector('.actionMenuPanel').getBoundingClientRect();
    return Math.min(Math.abs(menu.top - trigger.bottom - 6), Math.abs(trigger.top - menu.bottom - 6)) < 8
      && menu.left >= 9 && menu.right <= innerWidth - 9 && menu.bottom <= innerHeight - 9;
  })).toBe(true);
  await captureScreen('pet-anchored-menu');
  await petHeader.getByRole('button', { name:'반려동물 관리', exact:true }).click();
  await petHeader.getByRole('button', { name:'이름·사진 수정', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'반려동물 편집', exact:true })).toBeVisible();
  await page.getByRole('dialog', { name:'반려동물 편집', exact:true }).getByTitle('닫기', { exact:true }).click();
  console.log('People overview and pet detail controls fit Android; pet registration, anchored menu and editing use native storage.');
  const petPhoto = media.find(item => item.file_type === 'image');
  assert.ok(petPhoto, 'A real imported dog photo must be available');
  const thumbnailPath = await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('pet_thumbnail',{id}),petPhoto.id);
  const thumbnailBytes = await run('adb',['exec-out','run-as',appId,'cat',thumbnailPath],{encoding:null,maxBuffer:4*1024*1024,timeout:30_000});
  await writeFile(join(output,'pet-native-thumbnail.png'),thumbnailBytes.stdout);
  const inputPng = await page.evaluate(async path => {
    const response=await fetch(window.__TAURI_INTERNALS__.convertFileSrc(path,'asset'));
    const bitmap=await createImageBitmap(await response.blob());
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0);bitmap.close();
    return canvas.toDataURL('image/png').split(',')[1];
  },thumbnailPath);
  await writeFile(join(output,'pet-native-input.png'),Buffer.from(inputPng,'base64'));
  const detectorLock=JSON.parse(await readFile('scripts/pet-model-lock.json','utf8')).models.detector.files;
  const modelDigests=await page.evaluate(async files=>{
    const results=[];
    for(const [name,expected] of Object.entries(files)){
      const bytes=await (await fetch(new URL('/models/pets/detector/'+name,location.href))).arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      results.push({name,sha256:hash,bytes:bytes.byteLength,expected});
    }
    return results;
  },detectorLock);
  await writeFile(join(output,'pet-native-model-digests.json'),JSON.stringify(modelDigests,null,2));
  assert.ok(modelDigests.every(row=>row.sha256===row.expected.sha256 && row.bytes===row.expected.bytes),'APK detector bytes must match the reviewed model manifest');
  const petWaitStarted = Date.now();
  await expect.poll(async () => {
    const scan = await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
    if (scan) await writeFile(join(output,'pet-scan-before-confirmation.json'),JSON.stringify({photo:petPhoto,scan,progress:await page.locator('.petAnalysisNotice').innerText().catch(()=>''),diagnostics:await page.evaluate(()=>window.petDiagnostics)},null,2));
    return scan !== null;
  }, {timeout:180_000, intervals:[1000,2000,5000]}).toBe(true);
  let petScan = await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  const dog = petScan.detections.find(detection => detection.kind === 'dog');
  assert.ok(dog, 'The imported dog must be detected as a dog; see pet-scan-before-confirmation.json');
  assert.equal(dog.appearance.length,1024);
  assert.equal(dog.color.length,120);
  assert.equal(dog.shape.length,10);
  const registeredPet = (await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_pets')))[0];
  const prepared=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('prepare_pet_input',{id}),petPhoto.id);
  assert.match(prepared.sourceKey,/^sha256:[a-f0-9]{64}$/);
  assert.equal(petScan.source_key,prepared.sourceKey);
  await page.evaluate(({id,petId})=>window.__TAURI_INTERNALS__.invoke('confirm_pet_detection',{detectionId:id,petId,view:'front',excluded:false}),{id:dog.id,petId:registeredPet.id});
  await page.getByRole('button',{name:'사진 상세보기',exact:true}).first().click();
  await page.getByRole('button',{name:'인식 결과 확인·수정',exact:true}).click();
  const faceCard=page.locator('.petPhotoResults .petDetectionCard').first();
  await faceCard.getByRole('button',{name:'얼굴 영역 지정',exact:true}).click();
  await faceCard.locator('.petDetectionPreview').scrollIntoViewIfNeeded();
  const rectangle=await faceCard.locator('.petDetectionPreview').boundingBox();assert.ok(rectangle);
  const [bx,by,bw,bh]=dog.box;
  await page.mouse.move(rectangle.x+(bx+bw*0.20)*rectangle.width,rectangle.y+(by+bh*0.10)*rectangle.height);
  await page.mouse.down();await page.mouse.move(rectangle.x+(bx+bw*0.65)*rectangle.width,rectangle.y+(by+bh*0.45)*rectangle.height,{steps:5});await page.mouse.up();
  await faceCard.getByRole('button',{name:'얼굴 지정 마침',exact:true}).click();
  await faceCard.getByRole('button',{name:'선택한 얼굴로 후보 비교',exact:true}).click();
  await expect(faceCard.getByText('얼굴 특징으로 후보를 다시 비교했습니다. 반려동물을 선택한 뒤 저장해 주세요.',{exact:true})).toBeVisible({timeout:120_000});
  const beforeFaceSave=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  assert.equal(beforeFaceSave.detections.find(d=>d.id===dog.id).faceAppearance?.length??0,0,'Preview must not save features or change identity links');
  assert.equal(beforeFaceSave.detections.find(d=>d.id===dog.id).pet_id,registeredPet.id);
  await faceCard.getByRole('button',{name:'확인 저장',exact:true}).click();
  await expect.poll(async()=>{
    const scan=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
    return scan.detections.find(d=>d.id===dog.id)?.faceAppearance?.length;
  },{timeout:120_000}).toBe(1024);
  await captureScreen('pet-face-region');
  await page.getByRole('dialog',{name:'사진 상세',exact:true}).getByTitle('닫기',{exact:true}).click();
  petScan=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  const face=petScan.detections.find(d=>d.id===dog.id);
  await page.evaluate(({id,petId,features})=>window.__TAURI_INTERNALS__.invoke('update_pet_features',{detectionId:id,petId,view:'front',excluded:false,features:{...features,kind:'cat'}}),{id:dog.id,petId:registeredPet.id,features:face});
  const corrected=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  assert.equal(corrected.detections.find(d=>d.id===dog.id).kind,'cat');
  assert.equal(corrected.detections.find(d=>d.id===dog.id).detectedKind,'dog');
  await page.evaluate(({id,petId,features})=>window.__TAURI_INTERNALS__.invoke('update_pet_features',{detectionId:id,petId,view:'front',excluded:false,features}),{id:dog.id,petId:registeredPet.id,features:face});
  await page.evaluate(({mediaId,key,features})=>window.__TAURI_INTERNALS__.invoke('replace_pet_scan',{mediaId,sourceKey:key,expectedSourceKey:key,features:[features],allowSourceChange:false}),{mediaId:petPhoto.id,key:prepared.sourceKey,features:dog});
  petScan=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  assert.equal(petScan.detections.length,1);assert.equal(petScan.detections[0].id,dog.id);assert.equal(petScan.detections[0].faceAppearance.length,1024);
  await page.evaluate(({mediaId,detectionId,petId})=>window.__TAURI_INTERNALS__.invoke('save_pet_evaluation',{sample:{mediaId,detectionId,petId,role:'query',captureGroup:'android-smoke-only',view:'front',kind:'dog',rights:'test-only fixture; not a validation corpus'}}),{mediaId:petPhoto.id,detectionId:dog.id,petId:registeredPet.id});
  const exportPath=thumbnailPath.replace(/[^/]+$/,'pet-evaluation-smoke.json');
  await page.evaluate(destination=>window.__TAURI_INTERNALS__.invoke('export_pet_evaluation',{destination}),exportPath);
  const exportFile=await run('adb',['exec-out','run-as',appId,'cat',exportPath],{encoding:'utf8',maxBuffer:1024*1024,timeout:30_000});
  const exported=JSON.parse(exportFile.stdout);assert.equal(exported.queries.length,1);assert.equal(exported.queries[0].features.faceAppearance.length,1024);assert.equal(exported.automaticLinkingEnabled,false);assert.ok(!exportFile.stdout.includes(petPhoto.file_path));
  assert.deepEqual(await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_pet_evaluation_dataset')),exported);
  // This is explicit enrollment/confirmation, never an automatic identity claim.
  await page.evaluate(({id,petId}) => window.__TAURI_INTERNALS__.invoke('confirm_pet_detection',{detectionId:id,petId,view:'rear',excluded:false}),{id:dog.id,petId:registeredPet.id});
  petScan = await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),petPhoto.id);
  assert.equal(petScan.detections.find(detection => detection.id === dog.id).appearance.length,0);
  assert.equal(petScan.detections.find(detection => detection.id === dog.id).mirroredAppearance.length,0);
  assert.equal(petScan.detections.find(detection => detection.id === dog.id).faceAppearance.length,0);
  assert.equal(petScan.detections.find(detection => detection.id === dog.id).faceBox,undefined);
  await writeFile(join(output,'pet-recognition-smoke.json'),JSON.stringify({offline:true,photoCount:1,detectedDogs:petScan.detections.filter(d=>d.kind==='dog').length,analysisWaitMs:Date.now()-petWaitStarted,engineVersion:petScan.engine_version,rearClearsIdentityVectors:true,identityAccuracyMeasured:false,diagnostics:await page.evaluate(()=>window.petDiagnostics)},null,2));
  await page.getByRole('button',{name:'사진 상세보기',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'인식 결과 확인·수정',exact:true})).toBeVisible();
  await captureScreen('pet-photo-recognition-results');
  await page.getByRole('dialog',{name:'사진 상세',exact:true}).getByTitle('닫기',{exact:true}).click();
  const catFaceSmoke=await verifyInstalledCatFace(page,(await readFile('tests/fixtures/pet-cat.jpg')).toString('base64'));
  await writeFile(join(output,'pet-cat-face-smoke.json'),JSON.stringify({...catFaceSmoke,offline:true,identityAccuracyMeasured:false},null,2));
  const personSmoke=await verifyInstalledPersonRuntime(page,(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64'),petPhoto.id);
  await writeFile(join(output,'person-runtime-smoke.json'),JSON.stringify({...personSmoke,environment:'Android API 36 x86_64 emulator'},null,2));
  console.log('Offline Android person Worker and native persistence (NOT identity accuracy or phone performance): '+JSON.stringify(personSmoke));
  const repetitionSmoke = await verifyInstalledRepetitionMeasurement(page, petPhoto.id);
  await writeFile(join(output,'person-repetition-smoke.json'),JSON.stringify({...repetitionSmoke,environment:'Android API 36 x86_64 emulator'},null,2));
  await adb('shell','svc','wifi','enable');
  await adb('shell','svc','data','enable');
  console.log('Offline Android Worker dog inference, native feature persistence, explicit confirmation and rear-vector removal passed (not identity accuracy).');
  const runtimeBenchmark=await benchmarkInstalledPetRuntime(page,thumbnailPath);
  await writeFile(join(output,'pet-runtime-benchmark.json'),JSON.stringify({...runtimeBenchmark,environment:'Android API 36 x86_64 emulator',devicePerformanceMeasured:false},null,2));
  console.log('Android pet runtime benchmark (NOT phone performance): '+JSON.stringify({cpu:runtimeBenchmark.cpu,wasm:runtimeBenchmark.wasm}));

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
  await page.evaluate(async mediaId=>{
    await window.__TAURI_INTERNALS__.invoke('enqueue_pet_jobs',{jobs:[{mediaId,petId:null,view:'unknown'},{mediaId,petId:null,view:'unknown'}]});
    await window.__TAURI_INTERNALS__.invoke('control_pet_jobs',{resume:false});
  },petPhoto.id);
  assert.equal((await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_pet_jobs'))).paused,1);
  await disconnect();
  await adb('shell', 'am', 'force-stop', appId);
  await startApp();
  connection = await connect(); context = connection.context; page = connection.page;
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_media'))).length, 2);
  const savedQueue=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_pet_jobs'));assert.equal(savedQueue.paused,1);
  assert.equal((await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('pet_evaluation_summary'))).queries,1);
  await page.getByRole('button',{name:'분석 이어서 하기',exact:true}).click();
  await expect.poll(async()=>{const q=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_pet_jobs'));return q.pending+q.paused+q.failed;},{timeout:60_000}).toBe(0);
  await writeFile(join(output,'pet-queue-restart.json'),JSON.stringify({pausedAfterRestart:1,deduplicated:true,resumedAndCompleted:true,validationSamplesPersisted:1},null,2));
  await checkVideoPlayback(page, 'after-restart');
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_albums')))[0].title, '안드로이드에서 담은 추억');
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_diary')))[0].title, '휴대폰 한 화면의 일기');
  assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_pets')))[0].name, '안드로이드 보리');
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')))).length, 1);
  await page.locator('.navList').getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'안드로이드에서 담은 추억 앨범 열기', exact:true }).click();
  await loadedAlbumPhoto(page.getByRole('dialog', { name:'앨범 전체창', exact:true }));
  await captureScreen('system-bars-book-after-restart');
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
