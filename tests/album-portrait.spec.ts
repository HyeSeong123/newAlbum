import { expect, test } from '@playwright/test';

test('mixed orientations use portrait leaves without losing photos or page navigation', async ({ page }) => {
  await page.route('**/orientation-*.jpg', (route) => {
    const id = Number(route.request().url().match(/orientation-(\d+)/)![1]);
    if ([1, 5, 6, 7].includes(id)) {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#d8e8ed"/><rect x="25" y="25" width="550" height="850" fill="#52957e"/><rect x="25" y="25" width="550" height="75" fill="#eac173"/><rect x="25" y="800" width="550" height="75" fill="#be7373"/></svg>' });
    }
    return route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' });
  });
  await page.addInitScript(() => {
    const media = Array.from({ length: 8 }, (_, index) => {
      const id = index + 1;
      const portrait = [1, 5, 6, 7].includes(id);
      return { id, file_path: `C:/orientation-${id}.jpg`, file_type: 'image', taken_at: '2026-09-20',
        width: portrait ? 600 : 1920, height: portrait ? 900 : 1280, duration: null, size_bytes: 1000,
        rating: 0, comment: '', favorite: false, view_count: 0, metadata_status: 'ready' };
    });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [{ id: 1, title: '세로와 가로', description: '', cover_color: '#8A2E35', created_at: '2026-09-20', items: media }];
        return [];
      },
    } });
  });
  await page.goto('/');
  await expect(page.locator('.quickAlbum .frontAlbumTone')).toHaveCount(0);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '세로와 가로 앨범 열기', exact: true }).click();
  const left = page.locator('.albumPaper.left');
  const right = page.locator('.albumPaper.right');
  const pageLabel = page.locator('.albumPagerActions p');
  const titles = (side: typeof left) => side.locator('.albumPagePhoto').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  await expect(pageLabel).toHaveText('1 / 4 펼침');
  await expect(left).toHaveClass(/portrait-photo/);
  await expect(left.locator('.albumPagePhoto')).toHaveCount(1);
  await expect(right.locator('.albumPagePhoto')).toHaveCount(2);
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-2.jpg 상세보기', 'orientation-3.jpg 상세보기']);
  await page.locator('.albumBookBase, .albumPagePhoto img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  const portraitBox = await left.locator('.albumPagePhoto').boundingBox();
  const landscapeBox = await right.locator('.albumPagePhoto').first().boundingBox();
  expect(portraitBox!.height / portraitBox!.width).toBeCloseTo(1.5, 1);
  expect(portraitBox!.height).toBeGreaterThan(landscapeBox!.height * 1.5);
  await expect(left.locator('.mediaImage')).toHaveCSS('object-fit', 'contain');
  await page.screenshot({ path: `test-results/album-portrait-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByTitle('다음 책장', { exact: true }).click();
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'departing');
  await page.clock.runFor(230);
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'arriving');
  expect(await titles(left)).toEqual(['orientation-4.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-5.jpg 상세보기']);
  await expect(right).toHaveClass(/portrait-photo/);
  await expect(left).not.toHaveClass(/portrait-photo/);
  await page.clock.runFor(390);
  await page.clock.resume();
  await page.keyboard.press('ArrowRight');
  await expect(pageLabel).toHaveText('3 / 4 펼침');
  await expect(page.locator('.albumPaper.portrait-photo')).toHaveCount(2);
  expect(await titles(left)).toEqual(['orientation-6.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-7.jpg 상세보기']);
  await page.getByLabel('앨범 책장 이동').fill('4');
  await expect(pageLabel).toHaveText('4 / 4 펼침');
  expect(await titles(left)).toEqual(['orientation-8.jpg 상세보기']);
  await expect(right.locator('.albumPagePhoto')).toHaveCount(0);
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeDisabled();
  await page.getByLabel('앨범 책장 이동').fill('1');
  await left.locator('.albumPagePhoto').click();
  await expect(page.getByRole('dialog', { name: '사진 상세', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '앨범 전체창', exact: true })).toBeVisible();
  await page.getByTitle('사진 목록', { exact: true }).click();
  await expect(page.locator('.albumPhotoList > button')).toHaveCount(8);
  await page.getByTitle('책으로 보기', { exact: true }).click();
  await expect(pageLabel).toHaveText('1 / 4 펼침');
  await page.getByRole('button', { name: '앨범 보기 옵션', exact: true }).click();
  await page.getByRole('button', { name: '사진 순서 섞기', exact: true }).click();
  await page.getByTitle('사진 목록', { exact: true }).click();
  const shuffled = await page.locator('.albumPhotoList > button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')).sort());
  expect(shuffled).toEqual(Array.from({ length: 8 }, (_, index) => `orientation-${index + 1}.jpg 상세보기`));
});
