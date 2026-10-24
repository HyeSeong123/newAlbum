import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const stage = process.env.UX_AUDIT_STAGE ?? 'after';
const directory = `preview-results/ux-convenience/${stage}`;
async function capture(page: Page, name: string) {
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/${name}.png` });
}

for (const width of [320, 393]) {
  test(`photo navigation and rating stay easy to tap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.route('**/touch-photo-*.jpg', route => route.fulfill({ path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
    await page.addInitScript(() => {
      const rows = [1, 2].map(id => ({ id, file_path: `/touch-photo-${id}.jpg`, file_type: 'image', taken_at: '2026-10-20', title: `사진 ${id}`, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      Object.assign(window, { __touchRows: rows });
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        convertFileSrc: (path: string) => path,
        invoke: async (command: string, args: any = {}) => {
          if (command === 'list_media') return structuredClone(rows);
          if (command === 'media_thumbnail') return `/touch-photo-${args.id}.jpg`;
          if (command === 'update_media_details') { Object.assign(rows.find(row => row.id === args.id)!, { rating: args.rating, favorite: args.favorite, comment: args.comment }); return; }
          if (command === 'list_pet_jobs') return { jobs: [], pending: 0, paused: 0, failed: 0 };
          return [];
        },
      } });
    });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    await page.locator('.mediaTile[data-media-id="1"]').click();
    const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
    await expect(detail.locator('.detailFileName')).toHaveText('touch-photo-1.jpg');
    await detail.getByTitle('다음', { exact: true }).click();
    await expect(detail.locator('.detailFileName')).toHaveText('touch-photo-2.jpg');
    await detail.getByTitle('이전', { exact: true }).click();
    await expect(detail.locator('.detailFileName')).toHaveText('touch-photo-1.jpg');
    await capture(page, `07-photo-navigation-${width}`);
    const boxes = await detail.locator('.photoNavButton, .rating button').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { name: element.getAttribute('title'), width: rect.width, height: rect.height };
    }));
    await writeFile(`${directory}/07-touch-targets-${width}.json`, JSON.stringify(boxes, null, 2));
    if (stage !== 'before') for (const box of boxes) {
      expect(box.width, box.name ?? '').toBeGreaterThanOrEqual(44);
      expect(box.height, box.name ?? '').toBeGreaterThanOrEqual(44);
    }
    await detail.getByTitle('4점', { exact: true }).click();
    await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => (window as any).__touchRows[0].rating)).toBe(4);
    await capture(page, `08-photo-rating-${width}`);
    if (stage !== 'before') {
      const labelLines = await detail.locator('.detailRating h3').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      });
      expect(labelLines, 'The 별점 label stays on one line beside or above the touch targets').toBe(1);
    }
    expect(await detail.locator('.photoInformation').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await detail.getByTitle('닫기', { exact: true }).click();
    await expect(detail).toBeHidden();
    await page.locator('.mediaTile[data-media-id="1"]').click();
    await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test(`diary photo detach has a clear touch target and preserves the draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
    await page.getByRole('button', { name: '첫 일기 쓰기', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '새 일기', exact: true });
    await editor.getByLabel('제목', { exact: true }).fill('보존할 일기');
    await editor.getByLabel('내용', { exact: true }).fill('첨부만 빼도 글은 남아 있어요.');
    const image = readFileSync('tests/fixtures/pet-dog.jpg');
    await editor.getByLabel('일기 사진 파일').setInputFiles([1, 2].map(id => ({ name: `memory-${id}.jpg`, mimeType: 'image/jpeg', buffer: image })));
    await expect(editor.locator('.diaryAttachmentPrint')).toHaveCount(2);
    const remove = editor.getByRole('button', { name: '1번째 사진 첨부 해제', exact: true });
    await remove.scrollIntoViewIfNeeded();
    await capture(page, `09-diary-attachment-${width}`);
    const box = (await remove.boundingBox())!;
    if (stage !== 'before') {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await remove.click();
    await expect(editor.locator('.diaryAttachmentPrint')).toHaveCount(1);
    await expect(editor.getByLabel('제목', { exact: true })).toHaveValue('보존할 일기');
    await expect(editor.getByLabel('내용', { exact: true })).toHaveValue('첨부만 빼도 글은 남아 있어요.');
    await editor.getByRole('button', { name: '일기 저장', exact: true }).click();
    await expect(editor).toBeHidden();
    await page.locator('.diaryOpen').click();
    await page.getByRole('dialog', { name: '일기 상세', exact: true }).getByRole('button', { name: '일기 수정', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.diaryAttachmentPrint')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
