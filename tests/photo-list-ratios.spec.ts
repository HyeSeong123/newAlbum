import { expect, test, type Locator } from '@playwright/test';

async function expectFullPhotos(images: Locator, count: number) {
  await expect(images).toHaveCount(count);
  await images.evaluateAll((entries: HTMLImageElement[]) => {
    entries.forEach(image => { image.loading = 'eager'; });
    return Promise.all(entries.map(image => image.decode()));
  });
  for (const image of await images.all()) {
    await expect(image).toHaveCSS('object-fit', 'contain');
    await expect(image).toHaveCSS('object-position', '50% 50%');
    const frame = await image.evaluate((element: HTMLImageElement) => ({
      width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      originalWidth: element.naturalWidth, originalHeight: element.naturalHeight,
    }));
    expect(frame.width).toBeGreaterThan(5);
    expect(frame.height).toBeGreaterThan(5);
    expect(frame.originalWidth).toBeGreaterThan(0);
    expect(frame.originalHeight).toBeGreaterThan(0);
  }
}

test('journal, person, pet, calendar, memory and album lists show complete photo frames', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T12:00:00+09:00') });
  await page.route('**/full-frame-*.jpg', route => {
    const id = Number(route.request().url().match(/full-frame-(\d+)/)![1]);
    const [width, height] = [[600, 900], [1800, 600], [800, 800]][(id - 1) % 3];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#76afa3"/><rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#e9c86a" stroke-width="16"/><circle cx="${width / 2}" cy="${height / 2}" r="150" fill="#5893be"/></svg>` });
  });
  await page.addInitScript(() => {
    const media = Array.from({ length: 6 }, (_, index) => {
      const [width, height] = [[600, 900], [1800, 600], [800, 800]][index % 3];
      return { id: index + 1, file_path: `C:/full-frame-${index + 1}.jpg`, file_type: 'image', width, height,
        taken_at: `${index < 3 ? 2026 : 2025}-09-27`, size_bytes: 1000, rating: 0, comment: '', favorite: false };
    });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return media;
        if (command === 'media_thumbnail') return `C:/full-frame-${args.id}.jpg`;
        if (command === 'list_albums') return [{ id: 1, title: '원본 비율', description: '', cover_color: '#ffffff', created_at: '2026-09-27', items: media }];
        if (command === 'list_face_index') return { people: [{ id: 1, name: '가족' }],
          faces: media.slice(0, 3).map(item => ({ id: item.id, media_id: item.id, person_id: 1, thumbnail: '/favicon.svg', confirmed: true })), scanned: [1, 2, 3] };
        if (command === 'list_pets') return [{ id: 1, name: '보리', media_ids: [1, 2, 3], cover_media_id: 1 }];
        return [];
      },
    } });
  });
  await page.goto('/');
  await expectFullPhotos(page.locator('.journalMosaic .mediaImage'), 3);
  await expect(page.locator('.mediaTile .thumb').first()).toHaveCSS('background-color', 'rgb(238, 237, 231)');
  await page.screenshot({ path: `test-results/full-frames-journal-${test.info().project.name}.png` });
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await expectFullPhotos(page.locator('.calendarGrid .mediaImage'), 1);
  await page.locator('.calendarGrid .hasMedia').click();
  await expectFullPhotos(page.locator('.calendarThumbnails .mediaImage'), 3);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '사진 있는 날', exact: true }).click();
  await expectFullPhotos(page.locator('.recordedDayGrid .mediaImage'), 1);
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '가족 3장', exact: true }).click();
  await expectFullPhotos(page.locator('.personMediaGrid .mediaImage'), 3);
  await page.screenshot({ path: `test-results/full-frames-person-${test.info().project.name}.png` });
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await expectFullPhotos(page.locator('.petGrid .mediaImage'), 1);
  await page.getByRole('button', { name: '보리 3장', exact: true }).click();
  await expectFullPhotos(page.locator('.petGrid .mediaImage'), 3);
  await page.getByRole('button', { name: '사진·이름 편집', exact: true }).click();
  await expectFullPhotos(page.locator('.petEditor .mediaImage'), 6);
  await page.keyboard.press('Escape');
  await page.getByTitle('지난 추억', { exact: true }).click();
  await expectFullPhotos(page.locator('.memoryGrid .mediaImage'), 3);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '원본 비율 앨범 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  await expectFullPhotos(page.locator('.albumEditPhotos .mediaImage'), 6);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '원본 비율 앨범 열기', exact: true }).click();
  await page.getByTitle('사진 목록', { exact: true }).click();
  await expectFullPhotos(page.locator('.albumPhotoList .mediaImage'), 6);
  if (test.info().project.name === 'desktop') {
    const box = (await page.locator('.albumPhotoList > button > div').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(280);
  }
  await page.screenshot({ path: `test-results/full-frames-album-list-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
