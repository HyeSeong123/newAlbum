import { expect, test } from '@playwright/test';

test('date rail groups years, counts records and switches between favorites and dates', async ({ page }) => {
  await page.route('**/rail-*.jpg', (route) => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    const media = ['2026-09-12', '2026-09-12', '2026-09-12', '2026-05-31', '2025-11-03', '2024-06-01', null].map((taken_at, index) => ({
      id: index + 1, file_path: `C:/rail-${index + 1}.jpg`, taken_at, file_type: 'image',
      width: 1920, height: 1280, size_bytes: 1000, rating: 0, comment: '', favorite: [1, 4, 6].includes(index), metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => command === 'list_media' ? media : [],
    } });
  });
  await page.goto('/');
  const rail = page.getByRole('complementary', { name: '촬영 월', exact: true });
  await expect(rail.getByRole('button', { name: '2026년', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(rail.getByRole('button', { name: '2025년', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(rail.getByRole('button', { name: '2026년 9월', exact: true }).locator('.monthRailCount')).toHaveText('3');
  await expect(rail.getByRole('button', { name: '2026년 5월', exact: true }).locator('.monthRailCount')).toHaveText('1');
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  await page.locator('.mediaTile img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  await page.screenshot({ path: `test-results/photo-date-rail-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await rail.getByRole('button', { name: '2025년', exact: true }).click();
  await rail.getByRole('button', { name: '2025년 11월', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('2025년 11월');
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '5');
  await rail.getByRole('button', { name: '2025년', exact: true }).click();
  await expect(rail.getByRole('button', { name: '2025년 11월', exact: true })).toBeHidden();
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '5');
  await rail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('즐겨찾기');
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  await expect(rail.getByRole('button', { name: '즐겨찾기', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('textbox', { name: '사진과 추억 검색' }).fill('rail-5');
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '5');
  await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
  await page.locator('.mediaTile[data-media-id="5"]').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByTitle('즐겨찾기', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await expect(page.locator('.mediaTile[data-media-id="5"]')).toHaveCount(0);
  await rail.getByRole('button', { name: '날짜 없음', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '7');
  await rail.getByRole('button', { name: '모든 기록', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(7);
  await expect(page.locator('h1')).toHaveText('모든 기록');
});
