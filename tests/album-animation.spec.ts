import { expect, test, type Locator } from '@playwright/test';
import { ALBUM_TURN_TIMING } from '../src/features/albums/albumAnimation';

async function setAnimationTime(layer: Locator, time: number) {
  await layer.evaluate((element, currentTime) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = currentTime;
    }
  }, time);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/turn-photo-*.jpg', route => route.fulfill({
    path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg',
  }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1, file_path: `C:/turn-photo-${index + 1}.jpg`, file_type: 'image', taken_at: '2026-09-25',
      width: 1200, height: 800, size_bytes: 1000, rating: 0, comment: `사진 ${index + 1}`, favorite: false,
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums' ? [{
        id: 1, title: '책장 넘김', description: '', created_at: '2026-09-25', items: media,
      }] : [],
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '책장 넘김 앨범 열기', exact: true }).click();
  await page.locator('.albumBookBase, .albumPagePhoto img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
});

test('both faces remain attached to the binding and swap slowly without duplicate interactive photos', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const spread = page.locator('.albumSpread');
  const layer = page.locator('.albumTurnLayer');
  const photos = page.locator('.albumPagePhoto');
  const label = page.locator('.albumPagerActions p');
  const ids = () => photos.evaluateAll(elements => elements.map(element => element.getAttribute('data-media-id')));
  for (const direction of ['next', 'prev'] as const) {
    await page.getByTitle(direction === 'next' ? '다음 책장' : '이전 책장', { exact: true }).click();
    await setAnimationTime(layer, 0);
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    await expect(layer).toHaveAttribute('inert', '');
    await expect(photos).toHaveCount(4);
    for (const photo of await photos.all()) await expect(photo).toBeDisabled();
    const faceIds = (face: string) => layer.locator(`.${face} [data-turn-media-id]`).evaluateAll(elements => elements.map(element => element.getAttribute('data-turn-media-id')));
    expect(await faceIds('front')).toEqual(direction === 'next' ? ['3', '4'] : ['5', '6']);
    expect(await faceIds('back')).toEqual(direction === 'next' ? ['5', '6'] : ['3', '4']);
    await layer.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
    await expect(layer.locator('.albumTurningSheet')).toHaveCSS('animation-duration', '1.1s');
    const stationary = page.locator(`.albumPaper.${direction === 'next' ? 'right' : 'left'} .albumPagePhoto`);
    for (let index = 0; index < 2; index++) {
      const originalBox = (await stationary.nth(index).boundingBox())!;
      const frontBox = (await layer.locator('.front .albumTurnPhoto').nth(index).boundingBox())!;
      expect(Math.abs(originalBox.x - frontBox.x)).toBeLessThan(3);
      expect(Math.abs(originalBox.y - frontBox.y)).toBeLessThan(3);
      expect(Math.abs(originalBox.width - frontBox.width)).toBeLessThan(3);
      expect(Math.abs(originalBox.height - frontBox.height)).toBeLessThan(3);
    }
    const from = direction === 'next' ? 1 : 2;
    const to = direction === 'next' ? 2 : 1;
    await page.keyboard.press(direction === 'next' ? 'ArrowRight' : 'ArrowLeft');
    await page.clock.runFor(ALBUM_TURN_TIMING.swap - 1);
    await expect(label).toHaveText(`${from} / 3 펼침`);
    await expect(spread).toHaveAttribute('data-turn-phase', 'departing');
    await setAnimationTime(layer, 330);
    const frontTransform = await layer.locator('.albumTurningSheet').evaluate(element => getComputedStyle(element).transform);
    expect(frontTransform).toContain('matrix3d');
    await page.screenshot({ path: `test-results/album-turn-${direction}-front-${test.info().project.name}.png` });
    await page.clock.runFor(1);
    await expect(label).toHaveText(`${to} / 3 펼침`);
    await expect(spread).toHaveAttribute('data-turn-phase', 'arriving');
    expect(await ids()).toEqual(['1', '2', '7', '8']);
    await setAnimationTime(layer, 800);
    expect(await layer.locator('.albumTurningSheet').evaluate(element => getComputedStyle(element).transform)).not.toBe(frontTransform);
    await expect(layer.locator('.back')).toHaveCSS('backface-visibility', 'hidden');
    await expect(layer.locator('.back .albumTurnImages')).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `test-results/album-turn-${direction}-back-${test.info().project.name}.png` });
    await page.clock.runFor(ALBUM_TURN_TIMING.oppositeSwap - ALBUM_TURN_TIMING.swap - 1);
    expect(await ids()).toEqual(['1', '2', '7', '8']);
    await page.clock.runFor(1);
    await expect(spread).toHaveAttribute('data-turn-phase', 'settling');
    expect(await ids()).toEqual(direction === 'next' ? ['5', '6', '7', '8'] : ['1', '2', '3', '4']);
    await setAnimationTime(layer, ALBUM_TURN_TIMING.oppositeSwap + ALBUM_TURN_TIMING.oppositeReveal / 2);
    const opacity = await layer.locator('.back .albumTurnImages').evaluate(element => Number(getComputedStyle(element).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    await setAnimationTime(layer, ALBUM_TURN_TIMING.duration);
    await expect(layer.locator('.back .albumTurnImages')).toHaveCSS('opacity', '1');
    for (let index = 0; index < 2; index++) {
      const destination = (await page.locator(`.albumPaper.${direction === 'next' ? 'left' : 'right'} .albumPagePhoto`).nth(index).boundingBox())!;
      const backBox = (await layer.locator('.back .albumTurnPhoto').nth(index).boundingBox())!;
      expect(Math.abs(destination.x - backBox.x)).toBeLessThan(3);
      expect(Math.abs(destination.y - backBox.y)).toBeLessThan(3);
      expect(Math.abs(destination.height - backBox.height)).toBeLessThan(3);
    }
    await page.clock.runFor(ALBUM_TURN_TIMING.duration - ALBUM_TURN_TIMING.oppositeSwap - 1);
    await expect(layer).toHaveCount(1);
    await page.clock.runFor(1);
    await expect(layer).toHaveCount(0);
    for (const photo of await photos.all()) await expect(photo).toBeEnabled();
    await expect(spread).toHaveAttribute('aria-busy', 'false');
  }
  if (test.info().project.name === 'desktop') {
    for (const viewport of [{ width: 1080, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.getByLabel('앨범 책장 이동').fill('1');
      await page.getByTitle('다음 책장', { exact: true }).click();
      await setAnimationTime(layer, 0);
      const header = (await page.locator('.albumJournalHeader').boundingBox())!;
      const pager = (await page.locator('.albumJournalPager').boundingBox())!;
      for (const time of [250, 400, 550, 700, 850]) {
        await setAnimationTime(layer, time);
        const sheet = (await layer.locator('.albumTurningSheet').boundingBox())!;
        expect(sheet.y, `${viewport.width}x${viewport.height} at ${time}ms`).toBeGreaterThanOrEqual(header.y + header.height);
        expect(sheet.y + sheet.height, `${viewport.width}x${viewport.height} at ${time}ms`).toBeLessThanOrEqual(pager.y);
      }
      if (viewport.width === 1080) await page.screenshot({ path: 'test-results/album-turn-short-window.png' });
      await page.clock.runFor(ALBUM_TURN_TIMING.duration);
    }
  }
});

test('scrubbing, list view and closing cancel the slower turn; reduced motion stays immediate', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  const label = reader.locator('.albumPagerActions p');
  await reader.getByTitle('다음 책장', { exact: true }).click();
  await reader.getByLabel('앨범 책장 이동').fill('3');
  await page.clock.runFor(ALBUM_TURN_TIMING.duration + 100);
  await expect(label).toHaveText('3 / 3 펼침');
  await expect(reader.locator('.albumTurnLayer')).toHaveCount(0);
  await expect(reader.locator('.albumPagePhoto')).toHaveCount(1);
  await reader.getByTitle('이전 책장', { exact: true }).click();
  // Returning from the odd final spread still carries the correct photo on each face.
  await expect(reader.locator('.albumTurnFace.front [data-turn-media-id]')).toHaveAttribute('data-turn-media-id', '9');
  expect(await reader.locator('.albumTurnFace.back [data-turn-media-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-turn-media-id')))).toEqual(['7', '8']);
  await reader.getByTitle('사진 목록', { exact: true }).click();
  await page.clock.runFor(ALBUM_TURN_TIMING.duration + 100);
  await expect(reader.locator('.albumPhotoList > button')).toHaveCount(9);
  await reader.getByTitle('책으로 보기', { exact: true }).click();
  await expect(label).toHaveText('3 / 3 펼침');
  await reader.getByTitle('이전 책장', { exact: true }).click();
  await reader.getByTitle('닫기', { exact: true }).click();
  await page.clock.runFor(ALBUM_TURN_TIMING.duration + 100);
  await page.getByRole('button', { name: '책장 넘김 앨범 열기', exact: true }).click();
  await expect(label).toHaveText('1 / 3 펼침');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reader.getByTitle('다음 책장', { exact: true }).click();
  await expect(label).toHaveText('2 / 3 펼침');
  await expect(reader.locator('.albumTurnLayer')).toHaveCount(0);
  for (const entry of await reader.locator('.albumPhotoEntry').all()) await expect(entry).toHaveCSS('opacity', '1');
});
