import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('list requests thumbnail while detail keeps original', async ({ page }) => {
  const image = `data:image/jpeg;base64,${(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64')}`;
  await page.addInitScript(({ image }) => {
    const state = window as unknown as { thumbnailCalls: number; releaseThumbnail?: () => void };
    state.thumbnailCalls = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `${image}#${path.includes('cache') ? 'thumbnail' : 'original'}`,
      invoke: async (command: string) => {
        if (command === 'list_media') return [{ id: 1, file_path: 'C:/original.jpg', file_type: 'image', taken_at: '2026-09-08', size_bytes: 10000000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
        if (command === 'media_thumbnail') { state.thumbnailCalls += 1; await new Promise<void>((resolve) => { state.releaseThumbnail = resolve; }); return 'C:/cache/1.png'; }
        if (command === 'list_albums') return [];
        return [];
      },
    } });
  }, { image });
  await page.goto('/');
  await expect(page.locator('.mediaTile .thumb')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.mediaTile .thumb')).toHaveCSS('background-color', 'rgb(238, 237, 231)');
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseThumbnail?: () => void }).releaseThumbnail)).toBe('function');
  await page.screenshot({ path: `test-results/placeholder-${test.info().project.name}.png` });
  await page.evaluate(() => (window as unknown as { releaseThumbnail: () => void }).releaseThumbnail());
  await expect(page.locator('.mediaTile img.mediaImage')).toHaveAttribute('src', /#thumbnail$/);
  await page.locator('.mediaTile img.mediaImage').evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: `test-results/thumbnail-list-${test.info().project.name}.png` });
  await page.locator('.mediaTile').first().click();
  await expect(page.locator('.detailStage img.mediaImage')).toHaveAttribute('src', /#original$/);
  await page.getByTitle('닫기', { exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await expect(page.locator('.mediaTile img.mediaImage')).toHaveAttribute('src', /#thumbnail$/);
  expect(await page.evaluate(() => (window as unknown as { thumbnailCalls: number }).thumbnailCalls)).toBe(1);
});
