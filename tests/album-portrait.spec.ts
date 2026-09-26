import { expect, test, type Locator } from '@playwright/test';
import { ALBUM_TURN_TIMING } from '../src/features/albums/albumAnimation';

async function expectUncroppedPhoto(photo: Locator) {
  const image = photo.locator('.mediaImage');
  await image.evaluate((element: HTMLImageElement) => element.decode());
  await expect(image).toHaveCSS('object-fit', 'contain');
  const dimensions = await image.evaluate((element: HTMLImageElement) => ({
    width: element.naturalWidth, height: element.naturalHeight,
  }));
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  const box = (await photo.boundingBox())!;
  const imageBox = (await image.boundingBox())!;
  expect(box.width).toBeGreaterThan(10);
  expect(box.height).toBeGreaterThan(10);
  expect(imageBox.width).toBeCloseTo(box.width, 0);
  expect(imageBox.height).toBeCloseTo(box.height, 0);
}

test('mixed orientations use two uncropped photos per leaf without losing photos or page navigation', async ({ page }) => {
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
  await expect(pageLabel).toHaveText('1 / 2 펼침');
  await expect(left.locator('.albumPageImages')).toHaveClass(/layout-columns/);
  await expect(right.locator('.albumPageImages')).toHaveClass(/layout-rows/);
  await expect(left.locator('.albumPagePhoto')).toHaveCount(2);
  await expect(right.locator('.albumPagePhoto')).toHaveCount(2);
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기', 'orientation-2.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-3.jpg 상세보기', 'orientation-4.jpg 상세보기']);
  await expect(page.locator('.albumPageCaption p')).toHaveText(['천천히 남겨둔 순간', '바다를 따라 걷던 오후', '잠시 쉬어간 곳']);
  await expect(page.locator('.albumPageCaption time')).toHaveText(Array(4).fill('2026.09.20'));
  await page.locator('.albumBookBase, .albumPagePhoto img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  for (const photo of await page.locator('.albumPagePhoto').all()) await expectUncroppedPhoto(photo);
  for (const side of [left, right]) {
    const bounds = (await side.locator('.albumPageImages').boundingBox())!;
    const boxes = [];
    for (const entry of await side.locator('.albumPhotoEntry').all()) {
      const box = (await entry.boundingBox())!;
      expect(box.width).toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(20);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
      const caption = entry.locator('.albumPageCaption');
      const captionBox = (await caption.boundingBox())!;
      expect(captionBox.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(await caption.locator('time').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      boxes.push(box);
    }
    const [first, second] = boxes;
    expect(first.x + first.width <= second.x + 1 || first.y + first.height <= second.y + 1).toBe(true);
  }
  await page.screenshot({ path: `test-results/album-portrait-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.getByTitle('다음 책장', { exact: true }).click();
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'departing');
  await expect(right.locator('.albumPhotoEntry').first()).toHaveCSS('opacity', '0');
  await page.clock.runFor(ALBUM_TURN_TIMING.swap);
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'arriving');
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기', 'orientation-2.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-7.jpg 상세보기', 'orientation-8.jpg 상세보기']);
  await expect(left).not.toHaveClass(/portrait-photo/);
  await page.clock.runFor(ALBUM_TURN_TIMING.duration - ALBUM_TURN_TIMING.swap);
  await page.clock.resume();
  await page.keyboard.press('ArrowLeft');
  await expect(pageLabel).toHaveText('1 / 2 펼침');
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeEnabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await expect(pageLabel).toHaveText('2 / 2 펼침');
  expect(await titles(left)).toEqual(['orientation-5.jpg 상세보기', 'orientation-6.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-7.jpg 상세보기', 'orientation-8.jpg 상세보기']);
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeDisabled();
  const allPhotos: (string | null)[] = [];
  const counts = new Set<number>();
  for (let spread = 1; spread <= 2; spread++) {
    await page.getByLabel('앨범 책장 이동').fill(String(spread));
    await expect(pageLabel).toHaveText(`${spread} / 2 펼침`);
    const photos = [...await titles(left), ...await titles(right)];
    counts.add(photos.length);
    allPhotos.push(...photos);
    for (const photo of await page.locator('.albumPagePhoto').all()) await expectUncroppedPhoto(photo);
  }
  expect(allPhotos).toEqual(Array.from({ length: 8 }, (_, index) => `orientation-${index + 1}.jpg 상세보기`));
  expect([...counts]).toEqual([4]);
  await page.getByLabel('앨범 책장 이동').fill('1');
  await left.locator('.albumPagePhoto').first().click();
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
  await expect(pageLabel).toHaveText('1 / 2 펼침');
  await expect(left.locator('.albumPageCaption p').first()).toHaveText('다시 보아도 좋은 순간');
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기', 'orientation-2.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-3.jpg 상세보기', 'orientation-4.jpg 상세보기']);
  await page.getByTitle('사진 목록', { exact: true }).click();
  await expect(page.locator('.albumPhotoList > button')).toHaveCount(8);
  await expect(page.locator('.albumPhotoList .mediaImage').first()).toHaveCSS('object-fit', 'contain');
  await page.getByTitle('책으로 보기', { exact: true }).click();
  await expect(pageLabel).toHaveText('1 / 2 펼침');
  expect(await titles(left)).toEqual(['orientation-1.jpg 상세보기', 'orientation-2.jpg 상세보기']);
  expect(await titles(right)).toEqual(['orientation-3.jpg 상세보기', 'orientation-4.jpg 상세보기']);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.getByTitle('다음 책장', { exact: true }).click();
  await page.getByLabel('앨범 책장 이동').fill('2');
  await page.clock.runFor(ALBUM_TURN_TIMING.duration + 100);
  await expect(pageLabel).toHaveText('2 / 2 펼침');
  for (const entry of await page.locator('.albumPhotoEntry').all()) await expect(entry).toHaveCSS('opacity', '1');
  await page.clock.resume();
  await page.getByRole('button', { name: '앨범 보기 옵션', exact: true }).click();
  await page.getByRole('button', { name: '사진 순서 섞기', exact: true }).click();
  await page.getByTitle('사진 목록', { exact: true }).click();
  const shuffled = await page.locator('.albumPhotoList > button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')).sort());
  expect(shuffled).toEqual(Array.from({ length: 8 }, (_, index) => `orientation-${index + 1}.jpg 상세보기`));
});

test('duplicate album records do not repeat photos or create empty spreads after reopening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/duplicate-*.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1, file_path: `C:/duplicate-${index === 4 ? 1 : index + 1}.jpg`, file_type: 'image',
      taken_at: '2026-09-20', width: null, height: null, size_bytes: 1000, rating: 0, comment: '', favorite: false,
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums' ? [{
        id: 1, title: '중복 확인', description: '', created_at: '2026-09-20',
        items: [media[0], media[0], media[4], media[1], media[2], media[3], media[3]],
      }] : [],
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  for (let opening = 0; opening < 2; opening++) {
    await page.getByRole('button', { name: '중복 확인 앨범 열기', exact: true }).click();
    const reader = page.getByRole('dialog', { name: '앨범 전체창' });
    await expect(reader.locator('.albumJournalHeading')).toContainText('사진 4장');
    await expect(reader.locator('.albumPagerActions p')).toHaveText('1 / 1 펼침');
    await expect(reader.getByLabel('앨범 책장 이동')).toBeDisabled();
    const photos = reader.locator('.albumPagePhoto');
    await expect(photos).toHaveCount(4);
    expect(await photos.evaluateAll(elements => elements.map(element => element.getAttribute('data-media-id'))))
      .toEqual(['1', '2', '3', '4']);
    for (const photo of await photos.all()) await expectUncroppedPhoto(photo);
    await reader.getByTitle('사진 목록', { exact: true }).click();
    await expect(reader.locator('.albumPhotoList > button')).toHaveCount(4);
    await reader.getByTitle('닫기', { exact: true }).click();
  }
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
    const total = Math.ceil(count / 4);
    await expect(reader.locator('.albumPagePhoto')).toHaveCount(Math.min(4, count));
    await expect(reader.locator('.albumPagerActions p')).toHaveText(`${count ? 1 : 0} / ${total} 펼침`);
    if (total <= 1) await expect(reader.getByLabel('앨범 책장 이동')).toBeDisabled();
    else await expect(reader.getByLabel('앨범 책장 이동')).toBeEnabled();
    const seen: string[] = [];
    for (let spread = 1; spread <= total; spread++) {
      if (total > 1) await reader.getByLabel('앨범 책장 이동').fill(String(spread));
      const photos = reader.locator('.albumPagePhoto');
      await expect(photos).toHaveCount(Math.min(4, count - (spread - 1) * 4));
      seen.push(...await photos.evaluateAll(elements => elements.map(element => element.getAttribute('data-media-id')!)));
      for (const side of await reader.locator('.albumPaper').all()) {
        const bounds = (await side.locator('.albumPageImages').boundingBox())!;
        for (const entry of await side.locator('.albumPhotoEntry').all()) {
          const box = (await entry.boundingBox())!;
          expect(box.width).toBeGreaterThan(10);
          expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1);
          expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
          await expectUncroppedPhoto(entry.locator('.albumPagePhoto'));
        }
      }
    }
    expect(seen).toEqual(Array.from({ length: count }, (_, index) => String(index + 1)));
    if (count === 3) {
      await reader.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
      await page.screenshot({ path: `test-results/album-ratios-${test.info().project.name}.png` });
    }
    if (!count) await expect(reader.getByText('앨범에 담긴 기록이 없습니다.')).toBeVisible();
    await reader.getByTitle('닫기', { exact: true }).click();
  }
});

