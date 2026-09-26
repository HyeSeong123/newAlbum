import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('desktop original download handles cancellation, retry and repeated clicks', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { downloadCalls: { id: number; destination: string }[]; saveCalls: number; finishDownload?: () => void };
    state.downloadCalls = []; state.saveCalls = 0;
    const media = [1, 2].map(id => ({ id, file_path: `C:/original-${id}.jpg`, file_type: 'image', taken_at: '2026-09-27', width: 600, height: 900, size_bytes: 1000, rating: 0, comment: '', favorite: false }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'plugin:dialog|save') {
          state.saveCalls++;
          if (state.saveCalls === 1) return null;
          if (args.options.defaultPath !== 'original-1.jpg') throw new Error('Wrong original name');
          return 'D:/Downloads/original-1.jpg';
        }
        if (command === 'download_media') {
          state.downloadCalls.push(args);
          if (state.downloadCalls.length === 1) throw '사진을 저장할 수 없습니다.';
          await new Promise<void>(resolve => { state.finishDownload = resolve; });
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'original-1.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const download = detail.getByRole('button', { name: '원본 다운로드', exact: true });
  await download.click();
  await expect(download).toBeEnabled();
  expect(await page.evaluate(() => (window as any).downloadCalls.length)).toBe(0);
  await expect(detail.locator('.detailDownloadFeedback')).toHaveCount(0);
  await download.click();
  await expect(detail.getByRole('alert')).toHaveText('사진을 저장할 수 없습니다.');
  await download.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(download).toBeDisabled();
  expect(await page.evaluate(() => (window as any).downloadCalls)).toEqual([
    { id: 1, destination: 'D:/Downloads/original-1.jpg' },
    { id: 1, destination: 'D:/Downloads/original-1.jpg' },
  ]);
  await page.evaluate(() => (window as any).finishDownload());
  await expect(detail.locator('.detailDownloadFeedback[role="status"]')).toHaveText('원본 사진을 저장했습니다.');
  await expect(download).toBeEnabled();
  await page.screenshot({ path: `test-results/photo-download-${test.info().project.name}.png` });
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailDownloadFeedback')).toHaveCount(0);
});

test('browser download retains the original filename and bytes', async ({ page }) => {
  const original = await readFile('tests/fixtures/pet-dog.jpg');
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'original-photo.jpg', mimeType: 'image/jpeg', buffer: original });
  await page.getByRole('button', { name: 'original-photo.jpg 상세보기', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '원본 다운로드', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('original-photo.jpg');
  const saved = await download.path();
  expect(saved).not.toBeNull();
  expect(await readFile(saved!)).toEqual(original);
});
