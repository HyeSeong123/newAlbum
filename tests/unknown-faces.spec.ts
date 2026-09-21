import { expect, test } from '@playwright/test';

test('unknown directory shows only unnamed faces and retains person navigation', async ({ page }) => {
  await page.route('**/unknown-face-*.jpg', (route) => route.fulfill({
    path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg',
  }));
  await page.addInitScript(() => {
    const people = [{ id: 1, name: '아버님' }, { id: 2, name: '어머님' }, { id: 3, name: '' }, { id: 4, name: '  ' }];
    const faces = [...Array.from({ length: 28 }, (_, index) => index + 1), 101, 102].map((id) => ({
      id, media_id: id, person_id: id === 101 ? 1 : id === 102 ? 2 : id % 2 ? 3 : 4,
      thumbnail: `/unknown-face-${id}.jpg`, confirmed: false,
    }));
    const excluded = new Set([28]);
    const media = faces.map((face) => ({
      id: face.media_id, file_path: `C:/unknown-face-${face.media_id}.jpg`, file_type: 'image',
      taken_at: '2026-09-20', width: 640, height: 480, duration: null,
      size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string, args: { ids: number[]; target: number; excluded: boolean }) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'list_face_index') return {
          people, faces: faces.filter((face) => !excluded.has(face.id)), scanned: media.map((item) => item.id),
        };
        if (command === 'move_faces') faces.forEach((face) => {
          if (args.ids.includes(face.id)) face.person_id = args.target;
        });
        if (command === 'set_faces_excluded') args.ids.forEach((id) => {
          if (args.excluded) excluded.add(id); else excluded.delete(id);
        });
        return [];
      },
    } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '아버님 1장', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).click();
  const directory = page.getByRole('complementary', { name: '이름을 지정한 사람' });
  const unknown = directory.locator('.unknownDirectory');
  await unknown.click();
  await expect(unknown).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '미확인 얼굴', exact: true })).toBeVisible();
  await expect(page.locator('.personTile, .faceSelectionActions, .personEditor')).toHaveCount(0);
  await expect(page.locator('.personPhoto')).toHaveCount(24);
  await expect(page.locator('.personPhoto[data-selection-id="101"], .personPhoto[data-selection-id="102"], .personPhoto[data-selection-id="28"]')).toHaveCount(0);
  await page.locator('.personOriginal img').evaluateAll((images: HTMLImageElement[]) => {
    images.forEach((image) => { image.loading = 'eager'; });
    return Promise.all(images.map((image) => image.decode()));
  });
  await page.screenshot({ path: `test-results/unknown-directory-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(3);
  await expect(page.locator('.personPhoto').first()).toHaveAttribute('data-selection-id', '25');
  await page.getByRole('button', { name: '사진 상세보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세', exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: '사진 상세', exact: true }).getByTitle('닫기', { exact: true }).click();

  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).first().click();
  await page.getByLabel('옮길 인물').selectOption('1');
  await page.getByRole('button', { name: '옮기기', exact: true }).click();
  await expect(unknown).toContainText('26개 얼굴');
  await expect(page.locator('.personPhoto[data-selection-id="25"]')).toHaveCount(0);
  await directory.getByRole('button', { name: '아버님 사진 2장', exact: true }).click();
  await expect(page.locator('.personMediaGrid .personPhoto')).toHaveCount(2);
  await expect(page.locator('.faceSelectionActions')).toHaveCount(0);
  await unknown.click();
  await expect(page.locator('.personPhoto')).toHaveCount(24);
  await expect(page.locator('.personPhoto').first()).toHaveAttribute('data-selection-id', '1');

  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  for (const face of await page.getByRole('button', { name: '얼굴 선택', exact: true }).all()) await face.click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  for (const face of await page.getByRole('button', { name: '얼굴 선택', exact: true }).all()) await face.click();
  await expect(page.locator('.faceSelectionActions')).toContainText('26개 선택');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '얼굴 제외', exact: true }).click();
  await expect(page.getByText('미확인 얼굴이 없습니다.', { exact: true })).toBeVisible();
  await expect(directory).toBeVisible();
  await expect(page.locator('.personTile, .personPhoto')).toHaveCount(0);
  await expect(unknown).toContainText('0개 얼굴');
  await page.getByRole('button', { name: '제외 되돌리기', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(2);
  await expect(unknown).toContainText('26개 얼굴');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(24);
});
