import { expect, test } from '@playwright/test';

test('journal days show three representative photos before expanding', async ({ page }) => {
  await page.route('**/journal-preview-*.jpg', (route) => route.fulfill({
    path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg',
    contentType: 'image/jpeg',
  }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      file_path: `C:/journal-preview-${index}.jpg`,
      file_type: 'image',
      taken_at: index < 7 ? '2026-09-12' : '2026-09-06',
      width: index === 0 ? 900 : 640,
      height: index === 0 ? 600 : 480,
      duration: null,
      size_bytes: 1000,
      rating: 0,
      comment: '',
      favorite: false,
      metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [
          { id: 1, title: '가을 기록', description: '', cover_color: '#D8DDCB', created_at: '2026-09-12', items: media.slice(0, 7) },
          { id: 2, title: '주말의 기억', description: '', cover_color: '#6A4538', created_at: '2026-09-06', items: media.slice(7) },
        ];
        return [];
      },
    } });
  });

  await page.goto('/');
  const day = page.locator('.journalDay').first();
  await expect(day.locator('.mediaTile')).toHaveCount(3);
  if (test.info().project.name === 'desktop') {
    const boxes = await day.locator('.mediaTile').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width };
    }));
    expect(boxes[0].width / boxes[1].width).toBeCloseTo(1.8, 1);
    expect(Math.abs(boxes[1].x - boxes[2].x)).toBeLessThan(2);
    expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
    const nextDay = await page.locator('.journalDay').nth(1).locator('.mediaTile').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
    expect(Math.max(...nextDay) - Math.min(...nextDay)).toBeLessThan(1);
    const mosaic = day.locator('.journalMosaic');
    expect((await mosaic.boundingBox())!.height).toBeLessThanOrEqual(331);
    const album = await page.locator('.quickAlbum .frontAlbum').first().boundingBox();
    expect(album!.height / album!.width).toBeCloseTo(1.5, 1);
    await page.setViewportSize({ width: 2191, height: 1258 });
    expect((await mosaic.boundingBox())!.height).toBeLessThanOrEqual(331);
    expect((await page.locator('.workspace').boundingBox())!.width).toBeLessThanOrEqual(1440);
    await page.screenshot({ path: 'test-results/journal-preview-wide.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const more = day.getByRole('button', { name: '사진 4장 더보기' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: `test-results/journal-preview-${test.info().project.name}.png`, fullPage: true });
  await more.click();
  await expect(day.locator('.mediaTile')).toHaveCount(7);
  await expect(day.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
});
