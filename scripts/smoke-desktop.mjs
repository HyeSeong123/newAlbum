import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 30000 });
try {
  const context = browser.contexts()[0];
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 30000 });
  await page.waitForURL('http://127.0.0.1:5173/**');
  await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__?.invoke));
  await page.locator('.app').waitFor();
  await mkdir('test-results/desktop-smoke', { recursive: true });
  page.on('pageerror', error => console.error('WebView error:', error));
  await page.evaluate(() => {
    const nativeInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (...args) => {
      try { return await nativeInvoke(...args); }
      catch (error) { console.error('Native command failed:', args[0], String(error)); throw error; }
    };
  });
  page.on('console', message => { if (message.type() === 'error') console.error('WebView console:', message.text()); });
  const restarted = process.argv.includes('--restarted') || process.argv.includes('--upgraded');
  if (restarted) {
    assert.equal(await page.evaluate(() => localStorage.getItem('installer-smoke')), 'persisted');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.dayNotes'))['2026-10-01']), '이름 변경 전 날짜 메모');
    const diary = await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_diary'))[0]);
    assert.equal(diary.title, '이름 변경 전 일기');
    assert.equal(diary.body, '사진과 함께 보관한 기존 일기');
    assert.equal(diary.photos.length, 1);
    assert.equal(diary.album_id, await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].id));
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_media')).length), 1);
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_media'))[0].title), '설치 후에도 남아 있는 제목');
    const place = await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_media'))[0]);
    assert.equal(place.region_code, 'KR-11');
    assert.equal(place.district, '강남구');
    assert.equal(place.location_source, 'manual');
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].items[0].title), '설치 후에도 남아 있는 제목');
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].contents[0].kind), 'CHAPTER');
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].contents[2].body), '여행 마지막 날.\n가장 기억에 남는다.');
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].music_path.endsWith('smoke-music.wav')), true);
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].contents[1].display_duration), 3);
  } else {
    const wav = Buffer.alloc(44 + 16000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24);
    wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16000,40);
    const musicPath = resolve('test-results/desktop-smoke/smoke-music.wav');
    await writeFile(musicPath, wav);
    const count = await page.evaluate(async ({ path, musicPath }) => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      await invoke('register_paths', { paths: [path] });
      const media = await invoke('list_media');
      if (!(media[0].width > 0 && media[0].height > 0)) throw new Error('Imported image dimensions were not persisted');
      await invoke('update_media_title', { id: media[0].id, title: '설치 후에도 남아 있는 제목' });
      await invoke('assign_media_region', { ids:[media[0].id], regionCode:'KR-11', district:'강남구', country:'', city:'' });
      await invoke('create_album_from_media', { title: '제목 저장 확인', mediaIds: [media[0].id], coverColor: '#D8DDCB' });
      const album = (await invoke('list_albums'))[0];
      await invoke('update_album', { id:album.id, title:album.title, coverColor:album.cover_color, musicPath, mediaIds:[media[0].id], contents:[
        { id:'smoke-chapter', kind:'CHAPTER', media_id:null, title:'첫 번째 기록', body:'기존 앨범에서 시작', display_duration:5, transition_type:'fade', comment_visible:true },
        ...album.contents.map(entry => ({ ...entry, display_duration:3, transition_type:'zoom', comment_visible:false })),
        { id:'smoke-text', kind:'TEXT', media_id:null, title:'마지막 날', body:'여행 마지막 날.\n가장 기억에 남는다.', display_duration:8, transition_type:'fade', comment_visible:true },
      ] });
      const thumbnail = await invoke('media_thumbnail', { id: media[0].id });
      const image = new Image();
      image.src = window.__TAURI_INTERNALS__.convertFileSrc(thumbnail, 'asset');
      await image.decode();
      if (!image.naturalWidth) throw new Error('Native media protocol failed');
      await invoke('save_diary', { entry: { id: 0, date: '2026-10-01', title: '이름 변경 전 일기', body: '사진과 함께 보관한 기존 일기', mood: '평온', weather: '맑음', album_id: album.id, photos: [{ id: media[0].id, file_path: media[0].file_path }] } });
      localStorage.setItem('oraedameun.dayNotes', JSON.stringify({ '2026-10-01': '이름 변경 전 날짜 메모' }));
      localStorage.setItem('installer-smoke', 'persisted');
      return media.length;
    }, { path:resolve('tests/fixtures/pet-dog.jpg'), musicPath });
    assert.equal(count, 1);
  }
  if (!process.argv.includes('--seed-legacy')) {
  await expect(page).toHaveTitle('감자싹');
  await expect(page.locator('.brand').getByRole('img', { name: '감자싹', exact: true })).toBeVisible();
  assert.equal(await page.locator('.brand img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
  await page.reload();
  await page.locator('.app').waitFor();
  await expect(page.getByRole('heading', { name: '홈', exact: true })).toBeVisible();
  const mascot = page.getByRole('button', { name: '감자싹에게 말 걸기' });
  const greeting = await page.locator('.homeSpeech').innerText();
  await mascot.click();
  await expect(page.locator('.homeSpeech')).not.toHaveText(greeting);
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제목 저장 확인 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await expect(reader.getByRole('button', { name:'스토리로 보기', exact:true })).toHaveCount(0);
  await expect(reader.locator('.albumWrittenPage').first()).toContainText('첫 번째 기록');
  await reader.getByRole('button', { name:'앨범 수정', exact:true }).click();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await expect(editor.getByRole('button', { name:'스토리 음악', exact:true })).toHaveCount(0);
  await editor.getByRole('button', { name:'앨범 정보', exact:true }).click();
  await editor.getByRole('button', { name:'네이비 색상', exact:true }).click();
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  try { await expect(editor).toBeHidden({ timeout: 15000 }); }
  catch (error) {
    console.error('Album save failure:', await editor.innerText());
    console.error('Invalid fields:', await editor.locator(':invalid').evaluateAll(fields => fields.map(field => ({ tag:field.tagName, type:field.type, value:field.value, message:field.validationMessage }))));
    console.error('Stored albums:', await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_albums')));
    await page.screenshot({ path:'test-results/desktop-smoke/save-failed.png' });
    throw error;
  }
  await reader.getByTitle('닫기', { exact:true }).click();
  await expect(page.locator('.savedAlbumOpen .frontAlbumTone')).toHaveCSS('background-color', 'rgb(47, 64, 88)');
  await expect(page.locator('.savedAlbumOpen .frontAlbumTone')).toHaveCSS('opacity', '0.9');
  assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_albums'))[0].cover_color), '#2F4058');
  await page.screenshot({ path: `test-results/desktop-smoke/${process.argv.includes('--upgraded') ? 'upgraded' : restarted ? 'restarted' : 'installed'}.png` });
  console.log('Packaged webview, native commands, SQLite, thumbnails and persistence: OK');
  } else { console.log('Legacy app seeded: media, album, chapters, text, playback metadata and WebView storage.'); }
} finally {
  // Disconnect from CDP; the PowerShell check closes the actual desktop window.
  await browser.close();
}
