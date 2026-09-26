import { expect, test } from '@playwright/test';

for (const cancel of [true, false]) {
  test(`late initial media load stays consistent after ${cancel ? 'canceling' : 'finishing'} import`, async ({ page }) => {
    await page.addInitScript(({ cancel }) => {
      const media = [1, 2].map(id => ({ id, file_path: `C:/import-${id}.jpg`, file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        convertFileSrc: () => '/favicon.svg',
        invoke: async (command: string) => {
          if (command === 'list_media') {
            document.documentElement.dataset.loadPending = 'true';
            await new Promise(resolve => window.addEventListener('finish-initial-load', resolve, { once: true }));
            return media.slice(0, 1);
          }
          if (command === 'plugin:dialog|open') {
            document.documentElement.dataset.dialogChosen = 'true';
            return cancel ? null : ['C:/import-2.jpg'];
          }
          if (command === 'register_paths') return media;
          return [];
        },
      } });
    }, { cancel });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-load-pending', 'true');
    await page.getByRole('button', { name: '가져오기', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-dialog-chosen', 'true');
    await expect(page.getByRole('button', { name: '가져오기', exact: true })).toBeEnabled();
    if (!cancel) await expect(page.locator('.mediaTile')).toHaveCount(2);
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('finish-initial-load'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(page.locator('.mediaTile')).toHaveCount(cancel ? 1 : 2);
  });
}

test('rapid photo edits are persisted in order even when the first write fails', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [{ id: 1, file_path: 'C:/queued.jpg', file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
    const saves: Record<string, unknown>[] = [];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: Record<string, unknown>) => {
        if (command === 'list_media') return structuredClone(media);
        if (command === 'update_media_details') {
          saves.push(args);
          document.documentElement.dataset.saves = JSON.stringify(saves);
          if (saves.length === 1) {
            await new Promise(resolve => window.addEventListener('release-save', resolve, { once: true }));
            throw new Error('temporary write failure');
          }
          document.documentElement.dataset.persisted = JSON.stringify(args);
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.mediaTile').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-saves') || '[]').length).toBe(1);
  await detail.getByTitle('4점', { exact: true }).click();
  expect(JSON.parse(await page.locator('html').getAttribute('data-saves') || '[]')).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event('release-save')));
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-persisted') || '{}')).toEqual({ id: 1, rating: 4, comment: '', favorite: true });
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('albums loaded before the library remain viewable and edits survive the late library response', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [1, 2].map(id => ({ id, file_path: `C:/early-${id}.jpg`, file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => {
        if (command === 'list_media') {
          await new Promise(resolve => window.addEventListener('finish-library', resolve, { once: true }));
          return structuredClone(media);
        }
        if (command === 'list_albums') return [{ id: 1, title: '먼저 열린 앨범', description: '', cover_color: '#ffffff', created_at: '2026-09-25', items: structuredClone(media) }];
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '먼저 열린 앨범 앨범 열기', exact: true }).click();
  await page.getByRole('button', { name: '사진 목록', exact: true }).click();
  await page.getByRole('button', { name: 'early-1.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await detail.getByTitle('4점', { exact: true }).click();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('finish-library'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(detail.getByRole('button', { name: '즐겨찾기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailFileName')).toHaveText('early-2.jpg');
});

test('browser imports release session URLs after unregistering without touching original files', async ({ page }) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const created: string[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = object => {
      const url = create(object); created.push(url);
      document.documentElement.dataset.createdUrls = JSON.stringify(created);
      return url;
    };
    URL.revokeObjectURL = url => {
      revoked.push(url); document.documentElement.dataset.revokedUrls = JSON.stringify(revoked); revoke(url);
    };
  });
  await page.goto('/');
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('tests/fixtures/test-photo.jpg');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await fileInput.setInputFiles('tests/fixtures/test-photo.jpg');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  const created = JSON.parse(await page.locator('html').getAttribute('data-created-urls') || '[]');
  expect(created).toHaveLength(1);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '모두 비우기', exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-revoked-urls') || '[]')).toEqual(created);
});

test('comment storage failure retains the draft and retry adds only one comment', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles('tests/fixtures/test-photo.jpg');
  await page.locator('.mediaTile').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const form = detail.locator('.commentForm');
  await form.getByLabel('작성자').fill('나');
  await form.getByLabel('내용').fill('다시 저장할 기록');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'oraedameun.mediaComments') throw new Error('quota');
      original.call(this, key, value);
    };
    window.addEventListener('restore-storage', () => { Storage.prototype.setItem = original; }, { once: true });
  });
  await form.getByRole('button', { name: '댓글 등록' }).click();
  await expect(detail.getByRole('alert')).toContainText('댓글을 저장하지 못했습니다');
  await expect(form.getByLabel('내용')).toHaveValue('다시 저장할 기록');
  await expect(detail.locator('.commentItem')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')));
  await form.getByRole('button', { name: '댓글 등록' }).click();
  await expect(detail.locator('.commentItem')).toHaveCount(1);
  await expect(form.getByLabel('내용')).toHaveValue('');
});

test('calendar event storage failure keeps the form open for retry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '달력' }).click();
  await page.getByRole('button', { name: '일정 등록', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '일정 등록', exact: true });
  await dialog.getByPlaceholder('예: 엄마 생신, 가족 저녁 약속').fill('저장 확인');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'oraedameun.calendarEvents') throw new Error('quota');
      original.call(this, key, value);
    };
    window.addEventListener('restore-storage', () => { Storage.prototype.setItem = original; }, { once: true });
  });
  await dialog.getByRole('button', { name: '일정 추가' }).click();
  await expect(dialog.getByRole('alert')).toContainText('일정을 저장하지 못했습니다');
  await expect(dialog.getByPlaceholder('예: 엄마 생신, 가족 저녁 약속')).toHaveValue('저장 확인');
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')));
  await dialog.getByRole('button', { name: '일정 추가' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('oraedameun.calendarEvents') || '{}')).flat().length)).toBe(1);
});

test('export ignores duplicate submits and retains inputs after a failed copy', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [{ id: 1, file_path: 'C:/export.jpg', file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
    let calls = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [{ id: 1, title: '내보낼 앨범', description: '', cover_color: '#ffffff', created_at: '2026-09-25', items: media }];
        if (command === 'export_media_group') {
          document.documentElement.dataset.exportCalls = String(++calls);
          if (calls === 1) {
            await new Promise(resolve => window.addEventListener('release-export', resolve, { once: true }));
            throw '파일을 복사할 수 없습니다.';
          }
          return { copied: 1, directory: 'D:/exports/내보낼 앨범' };
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '내보낼 앨범 앨범 메뉴' }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '내보내기', exact: true });
  await dialog.getByLabel('내보낼 경로', { exact: true }).fill('D:/exports');
  await dialog.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-export-calls', '1');
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('release-export')));
  await expect(dialog.getByRole('alert')).toContainText('파일을 복사할 수 없습니다');
  await expect(dialog.getByLabel('내보낼 경로', { exact: true })).toHaveValue('D:/exports');
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click();
  await expect(dialog.getByText('1개 파일을 내보냈습니다')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-export-calls', '2');
});
