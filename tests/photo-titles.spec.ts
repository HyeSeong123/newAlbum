import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const stored = () => JSON.parse(localStorage.getItem('title-test-media') || 'null');
    const media = stored() || [1, 2].map(id => ({
      id, file_path: `C:/title-${id}.jpg`, file_type: 'image', taken_at: id === 1 ? '2026-09-26' : null,
      width: 600, height: 900, size_bytes: 1024, rating: 0, comment: '기존 댓글', favorite: false,
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return structuredClone(media);
        if (command === 'list_albums') return [{ id: 1, title: '제목 확인', description: '', cover_color: '#D8DDCB', created_at: '2026-09-26', items: structuredClone(media) }];
        if (command === 'update_media_title') {
          if (document.documentElement.dataset.failTitle === 'true') throw new Error('disk full');
          if (document.documentElement.dataset.holdTitle === 'true') {
            document.documentElement.dataset.titlePending = 'true';
            await new Promise(resolve => window.addEventListener('release-title', resolve, { once: true }));
          }
          media.find((item: any) => item.id === args.id).title = args.title;
          localStorage.setItem('title-test-media', JSON.stringify(media));
        }
        if (command === 'update_media_details') {
          Object.assign(media.find((item: any) => item.id === args.id), args);
          localStorage.setItem('title-test-media', JSON.stringify(media));
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제목 확인 앨범 열기', exact: true }).click();
});

test('title saves independently, appears above its own date and survives reopening', async ({ page }) => {
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  const photo = reader.locator('.albumPhotoEntry').filter({ has: page.locator('[data-media-id="1"]') });
  await expect(photo.locator('figcaption p')).toHaveCount(0);
  await photo.getByRole('button').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const input = detail.getByRole('textbox', { name: '사진 제목', exact: true });
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('maxlength', '120');
  await input.fill('  바람이 좋았던 오후 🌿  ');
  await input.press('ArrowLeft');
  await expect(detail.locator('.detailFileName')).toHaveText('title-1.jpg');
  await detail.getByRole('button', { name: '사진 제목 저장', exact: true }).click();
  await expect(detail.locator('.photoTitleForm').getByRole('status')).toHaveText('제목을 저장했습니다.');
  await expect(input).toHaveValue('바람이 좋았던 오후 🌿');
  await expect(detail.locator('.commentItem')).toContainText('기존 댓글');
  await detail.getByTitle('4점', { exact: true }).click();
  await detail.getByTitle('닫기', { exact: true }).click();
  await expect(photo.locator('figcaption p')).toHaveText('바람이 좋았던 오후 🌿');
  await expect(photo.locator('time')).toHaveText('2026.09.26');
  expect((await photo.locator('figcaption p').boundingBox())!.y).toBeLessThan((await photo.locator('time').boundingBox())!.y);
  await page.screenshot({ path: `test-results/photo-title-album-${test.info().project.name}.png` });
  await reader.getByRole('button', { name: '사진 목록', exact: true }).click();
  await expect(reader.locator('.albumPhotoName').first()).toHaveText('바람이 좋았던 오후 🌿');
  await page.reload();
  await page.locator('.navList').getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제목 확인 앨범 열기', exact: true }).click();
  await expect(photo.locator('figcaption p')).toHaveText('바람이 좋았던 오후 🌿');
  await photo.getByRole('button').click();
  await expect(input).toHaveValue('바람이 좋았던 오후 🌿');
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/photo-title-detail-${test.info().project.name}.png` });
  await input.fill('');
  await detail.getByRole('button', { name: '사진 제목 저장', exact: true }).click();
  await expect(detail.locator('.photoTitleForm').getByRole('status')).toHaveText('제목을 저장했습니다.');
  await detail.getByTitle('닫기', { exact: true }).click();
  await expect(photo.locator('figcaption p')).toHaveCount(0);
  await expect(photo.locator('time')).toHaveText('2026.09.26');
});

test('failed saves retain drafts and a late save cannot rename the next photo', async ({ page }) => {
  await page.locator('[data-media-id="1"].albumPagePhoto').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const input = detail.getByRole('textbox', { name: '사진 제목', exact: true });
  const save = detail.getByRole('button', { name: '사진 제목 저장', exact: true });
  await page.evaluate(() => { document.documentElement.dataset.failTitle = 'true'; });
  await input.fill('다시 저장할 제목');
  await save.click();
  await expect(detail.getByRole('alert')).toContainText('제목을 저장하지 못했습니다');
  await expect(input).toHaveValue('다시 저장할 제목');
  await expect(save).toBeEnabled();
  await page.evaluate(() => { document.documentElement.dataset.failTitle = 'false'; document.documentElement.dataset.holdTitle = 'true'; });
  await save.click();
  await expect(page.locator('html')).toHaveAttribute('data-title-pending', 'true');
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailFileName')).toHaveText('title-2.jpg');
  await expect(input).toHaveValue('');
  await page.evaluate(() => { document.documentElement.dataset.holdTitle = 'false'; window.dispatchEvent(new Event('release-title')); });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('title-test-media')!)[0].title)).toBe('다시 저장할 제목');
  await expect(input).toHaveValue('');
  await input.fill('날짜 없는 사진의 제목');
  await save.click();
  await expect(detail.locator('.photoTitleForm').getByRole('status')).toHaveText('제목을 저장했습니다.');
  await detail.getByTitle('닫기', { exact: true }).click();
  const entries = page.locator('.albumPhotoEntry');
  await expect(entries.nth(0).locator('figcaption p')).toHaveText('다시 저장할 제목');
  await expect(entries.nth(1).locator('figcaption p')).toHaveText('날짜 없는 사진의 제목');
  await expect(entries.nth(1).locator('time')).toHaveCount(0);
});
