import { expect, test } from '@playwright/test';

for (const cancel of [true, false]) {
  test(`registered media stays consistent after ${cancel ? 'canceling delayed selection' : 'finishing delayed registration'}`, async ({ page }) => {
    await page.addInitScript(({ cancel }) => {
      const media = [1, 2].map(id => ({ id, file_path: `C:/import-${id}.jpg`, file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        convertFileSrc: () => '/favicon.svg',
        invoke: async (command: string) => {
          // Startup gallery checking must finish before testing an import.
          if (command === 'list_media') return structuredClone(media.slice(0, 1));
          if ((command === 'plugin:dialog|open' || command === 'choose_android_gallery')) {
            document.documentElement.dataset.dialogChosen = 'true';
            if (cancel) {
              document.documentElement.dataset.importPending = 'true';
              await new Promise(resolve => window.addEventListener('finish-import', resolve, { once: true }));
            }
            return cancel ? null : ['C:/import-2.jpg'];
          }
          if (command === 'register_paths') {
            document.documentElement.dataset.importPending = 'true';
            await new Promise(resolve => window.addEventListener('finish-import', resolve, { once: true }));
            return structuredClone(media);
          }
          return [];
        },
      } });
    }, { cancel });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    await expect(page.locator('.mediaTile')).toHaveCount(1);
    await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
    await page.getByRole('dialog', { name: '사진·영상 가져오기' }).getByRole('button', { name: /^(파일 선택|갤러리 열기)$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-dialog-chosen', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-import-pending', 'true');
    await expect(page.locator('.mediaTile')).toHaveCount(1);
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('finish-import'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(page.locator('.mediaTile')).toHaveCount(cancel ? 1 : 2);
    await expect(page.getByRole('button', { name: '사진·영상 가져오기', exact: true })).toBeEnabled();
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
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('.mediaTile').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByTitle('즐겨찾기', {exact:true}).click();
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-saves') || '[]').length).toBe(1);
  await detail.getByTitle('4점', { exact: true }).click();
  expect(JSON.parse(await page.locator('html').getAttribute('data-saves') || '[]')).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event('release-save')));
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-persisted') || '{}')).toEqual({ id: 1, rating: 4, comment: '', favorite: true });
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('album photos remain viewable and edits survive a delayed media save', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [1, 2].map(id => ({ id, file_path: `C:/early-${id}.jpg`, file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    let saves = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: { id: number; rating: number; favorite: boolean; comment: string }) => {
        if (command === 'list_media') return structuredClone(media);
        if (command === 'update_media_details') {
          if (++saves === 1) {
            document.documentElement.dataset.albumSavePending = 'true';
            await new Promise(resolve => window.addEventListener('finish-album-save', resolve, { once: true }));
          }
          const item = media.find(item => item.id === args.id);
          if (item) Object.assign(item, { rating: args.rating, favorite: args.favorite, comment: args.comment });
          document.documentElement.dataset.albumPersisted = JSON.stringify(media[0]);
        }
        if (command === 'list_albums') return [{ id: 1, title: '먼저 열린 앨범', description: '', cover_color: '#ffffff', created_at: '2026-09-25', items: structuredClone(media) }];
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '먼저 열린 앨범 앨범 열기', exact: true }).click();
  await page.getByRole('button', { name: 'early-1.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByTitle('즐겨찾기', {exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-album-save-pending', 'true');
  await detail.getByTitle('4점', { exact: true }).click();
  await expect(detail.getByTitle('즐겨찾기', {exact:true})).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.getByTitle('4점', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('finish-album-save'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-album-persisted') || '{}')).toMatchObject({ id: 1, favorite: true, rating: 4 });
  await expect(detail.getByTitle('즐겨찾기', {exact:true})).toHaveAttribute('aria-pressed', 'true');
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
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('tests/fixtures/test-photo.jpg');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await fileInput.setInputFiles('tests/fixtures/test-photo.jpg');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  const created = JSON.parse(await page.locator('html').getAttribute('data-created-urls') || '[]');
  expect(created).toHaveLength(1);
  if (!await page.getByRole('button', { name: '설정', exact: true }).isVisible()) await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '모두 비우기', exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-revoked-urls') || '[]')).toEqual(created);
});



test('calendar unregister failure keeps the label and retry removes it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('oraedameun.calendarRegistrations-v1', JSON.stringify([
      { id: 'record', title: '저장 확인', startDate: '2026-09-25', endDate: '2026-09-25', mediaIds: ['1'], color: '#2F4058' },
    ]));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => command === 'list_media' ? [{ id: 1, file_path: 'C:/calendar.jpg', file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }] : [],
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('tab', { name: '달력' }).click();
  await page.locator('.monthPicker').getByLabel('연도', { exact: true }).selectOption('2026');
  await page.locator('.monthPicker').getByLabel('월', { exact: true }).selectOption('09');
  await page.locator('.calendarPeriodBar').click();
  const dialog = page.getByRole('dialog');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'oraedameun.calendarRegistrations-v1') throw new Error('quota');
      original.call(this, key, value);
    };
    window.addEventListener('restore-storage', () => { Storage.prototype.setItem = original; }, { once: true });
  });
  await dialog.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('달력 등록을 해제하지 못했습니다');
  await expect(page.locator('.calendarPeriodBar')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')!).length)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')));
  await dialog.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '저장 확인', exact: true })).toHaveCount(0);
  await expect(page.locator('.calendarPeriodBar')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')!).length)).toBe(0);
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
  await page.getByRole('button', { name: '앨범 내보내기', exact: true }).click();
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
