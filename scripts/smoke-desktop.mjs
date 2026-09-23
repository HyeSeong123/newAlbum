import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 30000 });
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 30000 });
  await page.waitForURL('http://127.0.0.1:5173/**');
  await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__?.invoke));
  await page.locator('.app').waitFor();
  await mkdir('test-results/desktop-smoke', { recursive: true });
  if (process.argv.includes('--restarted')) {
    assert.equal(await page.evaluate(() => localStorage.getItem('installer-smoke')), 'persisted');
    assert.equal(await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('list_media')).length), 1);
  } else {
    const count = await page.evaluate(async (path) => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      await invoke('register_paths', { paths: [path] });
      const media = await invoke('list_media');
      const thumbnail = await invoke('media_thumbnail', { id: media[0].id });
      const image = new Image();
      image.src = window.__TAURI_INTERNALS__.convertFileSrc(thumbnail);
      await image.decode();
      if (!image.naturalWidth) throw new Error('Native media protocol failed');
      localStorage.setItem('installer-smoke', 'persisted');
      return media.length;
    }, resolve('tests/fixtures/pet-dog.jpg'));
    assert.equal(count, 1);
  }
  await page.reload();
  await page.locator('.app').waitFor();
  await page.screenshot({ path: `test-results/desktop-smoke/${process.argv.includes('--restarted') ? 'restarted' : 'installed'}.png` });
  console.log('Packaged webview, native commands, SQLite, thumbnails and persistence: OK');
} finally {
  // Disconnect from CDP; the PowerShell check closes the actual desktop window.
  await browser.close();
}
