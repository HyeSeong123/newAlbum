import { expect, test } from '@playwright/test';

test('albums and person groups export unique original files through the export modal', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [1, 2].map((id) => ({ id, file_path: `C:/photos/export-${id}.jpg`, file_type: 'image', taken_at: '2026-09-21', width: 1200, height: 800, duration: null, size_bytes: 2000, rating: 0, comment: '', favorite: false, view_count: 0, metadata_status: 'ready' }));
    const faces = [
      { id: 11, media_id: 1, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
      { id: 12, media_id: 1, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
      { id: 13, media_id: 2, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
    ];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [{ id: 1, title: '가족 앨범', description: '', cover_color: '#ffffff', created_at: '2026-09-21', items: media }];
        if (command === 'list_face_index') return { people: [{ id: 7, name: '지은' }], faces, scanned: [1, 2] };
        if (command === 'export_media_group') {
          const exports = JSON.parse(document.documentElement.dataset.exports || '[]');
          exports.push(args);
          document.documentElement.dataset.exports = JSON.stringify(exports);
          return { directory: `${args.destinationRoot}/${args.folderName}`, copied: args.sourcePaths.length };
        }
        return [];
      },
    } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '가족 앨범 앨범 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '내보내기', exact: true });
  await expect(dialog.getByLabel('폴더명', { exact: true })).toHaveValue('가족 앨범');
  await dialog.getByLabel('내보낼 경로', { exact: true }).fill('D:/exports');
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click();
  await expect(dialog.getByText('2개 파일을 내보냈습니다')).toBeVisible();
  await dialog.locator('.exportComplete').getByRole('button', { name: '닫기', exact: true }).click();

  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '지은 2장', exact: true }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '내보내기', exact: true });
  await expect(dialog.getByLabel('폴더명', { exact: true })).toHaveValue('지은');
  await dialog.getByLabel('내보낼 경로', { exact: true }).fill('D:/people');
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click();
  await expect(dialog.getByText('2개 파일을 내보냈습니다')).toBeVisible();
  await page.screenshot({ path: `test-results/export-complete-${test.info().project.name}.png` });

  const exports = JSON.parse(await page.locator('html').getAttribute('data-exports') || '[]');
  expect(exports).toEqual([
    { sourcePaths: ['C:/photos/export-1.jpg', 'C:/photos/export-2.jpg'], destinationRoot: 'D:/exports', folderName: '가족 앨범' },
    { sourcePaths: ['C:/photos/export-1.jpg', 'C:/photos/export-2.jpg'], destinationRoot: 'D:/people', folderName: '지은' },
  ]);
});
