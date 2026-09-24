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
    Math.random = () => 1234 / 0x100000000;
    const media = Array.from({ length: 8 }, (_, index) => {
      const id = index + 1;
      const portrait = [1, 5, 6, 7].includes(id);
      return { id, file_path: `C:/orientation-${id}.jpg`, file_type: 'image', taken_at: '2026-09-20',
        width: portrait ? 600 : 1920, height: portrait ? 900 : 1280, duration: null, size_bytes: 1000,
        rating: 0, comment: id <= 3 ? ['천천히 남겨둔 순간', '바다를 따라 걷던 오후', '잠시 쉬어간 곳'][index] : '', favorite: false, view_count: 0, metadata_status: 'ready' };
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
  await expect(page.locator('.albumPhotoList')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /자동\s?배치|^[123]장$/ })).toHaveCount(0);
  const left = page.locator('.albumPaper.left');
  const right = page.locator('.albumPaper.right');
  const pageLabel = page.locator('.albumPagerActions p');
  const titles = (side: typeof left) => side.locator('.albumPagePhoto').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  await expect(pageLabel).toHaveText('1 / 5 펼침');
  await expect(left).toHaveClass(/portrait-photo/);
  await expect(left.locator('.albumPagePhoto')).toHaveCount(1);
  await expect(right.locator('.albumPagePhoto')).toHaveCount(2);
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-2.jpg 상세보기', 'orientation-3.jpg 상세보기']);
  await expect(page.locator('.albumPageCaption p')).toHaveText(['천천히 남겨둔 순간', '바다를 따라 걷던 오후', '잠시 쉬어간 곳']);
  await expect(page.locator('.albumPageCaption time')).toHaveText(['2026.09.20', '2026.09.20', '2026.09.20']);
  await page.locator('.albumBookBase, .albumPagePhoto img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  const portraitBox = await left.locator('.albumPagePhoto').boundingBox();
  const landscapeBox = await right.locator('.albumPagePhoto').first().boundingBox();
  expect(portraitBox!.height / portraitBox!.width).toBeCloseTo(1.5, 1);
  expect(portraitBox!.height).toBeGreaterThan(landscapeBox!.height * 1.5);
  await expect(left.locator('.mediaImage')).toHaveCSS('object-fit', 'contain');
  for (const side of [left, right]) {
    const bounds = (await side.locator('.albumPageImages').boundingBox())!;
    let previousBottom = bounds.y;
    for (const entry of await side.locator('.albumPhotoEntry').all()) {
      const box = (await entry.boundingBox())!;
      expect(box.width).toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(20);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(box.y).toBeGreaterThanOrEqual(previousBottom - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
      const caption = entry.locator('.albumPageCaption');
      const captionBox = (await caption.boundingBox())!;
      expect(captionBox.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(await caption.locator('time').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      previousBottom = box.y + box.height;
    }
  }
  await page.screenshot({ path: `test-results/album-portrait-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByTitle('다음 책장', { exact: true }).click();
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'departing');
  await expect(right.locator('.albumPhotoEntry').first()).toHaveCSS('opacity', '0');
  await page.clock.runFor(230);
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'arriving');
  expect(await titles(left)).toEqual(['orientation-4.jpg 상세보기']);
  expect(await titles(right)).toEqual([]);
  await expect(left).not.toHaveClass(/portrait-photo/);
  await page.clock.runFor(390);
  await page.clock.resume();
  await page.keyboard.press('ArrowRight');
  await expect(pageLabel).toHaveText('3 / 5 펼침');
  await expect(page.locator('.albumPaper.portrait-photo')).toHaveCount(2);
  expect(await titles(left)).toEqual(['orientation-5.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-6.jpg 상세보기']);
  await page.getByLabel('앨범 책장 이동').fill('5');
  await expect(pageLabel).toHaveText('5 / 5 펼침');
  expect(await titles(left)).toEqual(['orientation-8.jpg 상세보기']);
  await expect(right.locator('.albumPagePhoto')).toHaveCount(0);
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeDisabled();
  const allPhotos: (string | null)[] = [];
  const counts = new Set<number>();
  for (let spread = 1; spread <= 5; spread++) {
    await page.getByLabel('앨범 책장 이동').fill(String(spread));
    await expect(pageLabel).toHaveText(`${spread} / 5 펼침`);
    const photos = [...await titles(left), ...await titles(right)];
    counts.add(photos.length);
    allPhotos.push(...photos);
  }
  expect(allPhotos).toEqual(Array.from({ length: 8 }, (_, index) => `orientation-${index + 1}.jpg 상세보기`));
  expect([...counts].sort()).toEqual([1, 2, 3]);
  await page.getByLabel('앨범 책장 이동').fill('1');
  await left.locator('.albumPagePhoto').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await expect(detail).toBeVisible();
  await detail.getByTitle('즐겨찾기', { exact: true }).click();
  await detail.getByTitle('5점', { exact: true }).click();
  await detail.locator('.commentForm').getByLabel('작성자').fill('나');
  await detail.locator('.commentForm').getByLabel('내용').fill('다시 보아도 좋은 순간');
  await detail.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(detail.locator('.commentItem')).toContainText('다시 보아도 좋은 순간');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '앨범 전체창', exact: true })).toBeVisible();
  await expect(pageLabel).toHaveText('1 / 5 펼침');
  await expect(left.locator('.albumPageCaption p')).toHaveText('다시 보아도 좋은 순간');
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-2.jpg 상세보기', 'orientation-3.jpg 상세보기']);
  await page.getByTitle('사진 목록', { exact: true }).click();
  await expect(page.locator('.albumPhotoList > button')).toHaveCount(8);
  await expect(page.locator('.albumPhotoList .mediaImage').first()).toHaveCSS('object-fit', 'contain');
  await page.getByTitle('책으로 보기', { exact: true }).click();
  await expect(pageLabel).toHaveText('1 / 5 펼침');
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-2.jpg 상세보기', 'orientation-3.jpg 상세보기']);
  await page.getByRole('button', { name: '앨범 보기 옵션', exact: true }).click();
  await page.getByRole('button', { name: '사진 순서 섞기', exact: true }).click();
  await page.getByTitle('사진 목록', { exact: true }).click();
  const shuffled = await page.locator('.albumPhotoList > button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')).sort());
  expect(shuffled).toEqual(Array.from({ length: 8 }, (_, index) => `orientation-${index + 1}.jpg 상세보기`));
});

test('empty, single and extreme-ratio albums fit both book leaves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/ratio-*.jpg', route => {
    const id = Number(route.request().url().match(/ratio-(\d+)/)![1]);
    const [width, height] = id === 1 ? [2400, 400] : id === 2 ? [800, 800] : [400, 1600];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#67a793"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#eec34a" stroke-width="8"/></svg>` });
  });
  await page.addInitScript(() => {
    Math.random = () => 1234 / 0x100000000;
    const media = [[2400, 400], [800, 800], [null, null]].map(([width, height], index) => ({
      id: index + 1, file_path: `C:/ratio-${index + 1}.jpg`, file_type: 'image', taken_at: index ? '2026-09-12' : null,
      width, height, size_bytes: 1024, rating: 0, comment: index === 1 ? '종이 너비를 넘을 만큼 긴 설명도 사진과 날짜를 밀어내지 않습니다.'.repeat(3) : '',
      favorite: false, metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums' ? [
        { id: 1, title: '다양한 비율', description: '', created_at: '2026-09-12', items: media },
        { id: 2, title: '한 장', description: '', created_at: '2026-09-12', items: media.slice(0, 1) },
        { id: 3, title: '빈 앨범', description: '', created_at: '2026-09-12', items: [] },
      ] : [],
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  for (const [title, count] of [['다양한 비율', 3], ['한 장', 1], ['빈 앨범', 0]] as const) {
    await page.getByRole('button', { name: `${title} 앨범 열기`, exact: true }).click();
    await expect(reader.locator('.albumPagePhoto')).toHaveCount(count);
    await expect(reader.locator('.albumPagerActions p')).toHaveText(`${count ? '1 / 1' : '0 / 0'} 펼침`);
    await expect(reader.getByLabel('앨범 책장 이동')).toBeDisabled();
    for (const side of await reader.locator('.albumPaper').all()) {
      const bounds = (await side.locator('.albumPageImages').boundingBox())!;
      for (const entry of await side.locator('.albumPhotoEntry').all()) {
        const box = (await entry.boundingBox())!;
        expect(box.width).toBeGreaterThan(10);
        expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
        await expect(entry.locator('.mediaImage')).toHaveCSS('object-fit', 'contain');
      }
    }
    if (count === 3) {
      await reader.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
      await page.screenshot({ path: `test-results/album-ratios-${test.info().project.name}.png` });
    }
    if (!count) await expect(reader.getByText('앨범에 담긴 기록이 없습니다.')).toBeVisible();
    await reader.getByTitle('닫기', { exact: true }).click();
  }
});

