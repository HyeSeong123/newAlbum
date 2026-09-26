import { expect, test } from '@playwright/test';

test('album overview and photo tools preserve the full frame and editing workflow', async ({ page }) => {
  await page.route('**/detail-*.jpg', route => {
    const portrait = route.request().url().includes('detail-1');
    const [w, h] = portrait ? [600, 900] : [1600, 600];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#d8ddcb"/><rect x="10" y="10" width="${w - 20}" height="${h - 20}" fill="none" stroke="#8a805a" stroke-width="20"/><circle cx="${w / 2}" cy="${h / 2}" r="160" fill="#b9c58e"/></svg>` });
  });
  await page.addInitScript(() => {
    const media = [1, 2].map(id => ({ id, file_path: `C:/detail-${id}.jpg`, file_type: 'image', taken_at: '2026-09-20', width: id === 1 ? 600 : 1600, height: id === 1 ? 900 : 600, size_bytes: 102400, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [{ id: 1, title: '가을의 기록', description: '', cover_color: '#B9C58E', created_at: '2026-09-20', items: media }];
        if (command === 'media_thumbnail') return `C:/detail-${args.id}.jpg`;
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '가을의 기록 앨범 열기', exact: true }).click();
  await page.getByRole('button', { name: '사진 목록', exact: true }).click();
  await expect(page.locator('.albumPhotoList > button')).toHaveCount(2);
  for (const image of await page.locator('.albumPhotoList .mediaImage').all()) {
    await expect(image).toHaveCSS('object-fit', 'contain');
  }
  await page.getByRole('button', { name: 'detail-1.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await expect(detail.locator('.detailImageCanvas img')).toHaveCSS('object-fit', 'contain');
  const viewport = detail.locator('.detailImageViewport');
  expect(await viewport.evaluate(el => el.clientHeight > 150 && el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await detail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(detail.getByRole('button', { name: '즐겨찾기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await detail.getByTitle('4점', { exact: true }).click();
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await detail.getByRole('button', { name: '댓글 0', exact: true }).click();
  await expect(detail.locator('.commentForm textarea')).toBeFocused();
  await detail.locator('.commentForm').getByLabel('작성자').fill('우리');
  await detail.locator('.commentForm').getByLabel('내용').fill('함께 남긴 가을의 추억');
  await detail.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(detail.locator('.commentItem')).toContainText('함께 남긴 가을의 추억');
  await detail.getByTitle('댓글 수정').click();
  await detail.locator('.commentEditForm').getByLabel('내용').fill('오래 기억하고 싶은 하루');
  await detail.locator('.commentEditForm').getByRole('button', { name: '저장' }).click();
  await expect(detail.locator('.commentItem')).toContainText('오래 기억하고 싶은 하루');
  await detail.getByTitle('확대 보기', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사진 확대 보기', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toBeVisible();
  await expect(detail.getByTitle('확대 보기', { exact: true })).toBeFocused();
  await detail.getByRole('button', { name: '확대', exact: true }).click();
  await expect(detail.locator('.detailZoomControls output')).toHaveText('125%');
  await detail.getByTitle('사진 전체에 맞추기').click();
  await expect(detail.locator('.detailZoomControls output')).toHaveText('100%');
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailFileName')).toHaveText('detail-2.jpg');
  await detail.getByTitle('이전', { exact: true }).click();
  await expect(detail.locator('.commentItem')).toContainText('오래 기억하고 싶은 하루');
  await detail.locator('.detailPhotoPane').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/photo-detail-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await detail.locator('.detailPhotoActions button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await detail.getByTitle('댓글 삭제').click();
  await expect(detail.locator('.commentItem')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.albumPhotoList > button')).toHaveCount(2);
});
