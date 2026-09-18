import { expect, test } from '@playwright/test';

test('redesigned views fit and retain photo workflows', async ({ page }) => {
  await page.route('**/design-photo-*.jpg', (route) => {
    const index = Number(route.request().url().match(/design-photo-(\d+)/)![1]);
    return route.fulfill({ path: `node_modules/@vladmandic/face-api/demo/sample${index % 6 + 1}.jpg`, contentType: 'image/jpeg' });
  });
  await page.addInitScript(() => {
    const media = Array.from({ length: 18 }, (_, index) => ({ id: index + 1, file_path: `C:/design-photo-${index}.jpg`, file_type: 'image', taken_at: `2026-09-${String(index % 12 + 1).padStart(2, '0')}`, width: 640, height: 480, duration: null, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return Array.from({ length: 9 }, (_, index) => ({ id: index + 1, title: ['우리의 봄', '함께 걷던 날', '여름의 기억', '가족 여행', '오래된 순간', '다시, 가을', '소중한 하루', '그해 겨울', '우리집 앨범'][index], description: '', cover_color: ['#B9C58E', '#AFC5CF', '#D8B18F'][index % 3], created_at: '2026-09-06', items: media.slice(index, index + 4) }));
        return [];
      },
    } });
  });
  await page.goto('/');
  await expect(page.locator('.galleryGrid .mediaTile')).toHaveCount(18);
  await page.locator('.galleryGrid img').first().evaluate((img: HTMLImageElement) => img.decode());
  const capture = async (name: string) => {
    await page.screenshot({ path: `test-results/design-${name}-${test.info().project.name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };
  await capture('gallery');
  await expect(page.locator('.overviewGrid')).toHaveCount(0);
  await expect(page.locator('.topbar .importActions')).toBeVisible();
  if (test.info().project.name === 'desktop') {
    const nav = await page.locator('.sidebar').boundingBox();
    expect(nav!.height).toBe(100);
    await expect(page.locator('.sidebar .navList button').first()).toHaveCSS('font-size', '16px');
    const tabs = await page.locator('.viewTabs').boundingBox();
    const actions = await page.locator('.collectionTools').boundingBox();
    expect(Math.abs(tabs!.y + tabs!.height / 2 - actions!.y - actions!.height / 2)).toBeLessThan(4);
  }
  const lightVariant = await page.addStyleTag({ content: '.sidebar { background: #f0f1f3; border-right: 1px solid #dedfe3; } .brand strong, .brandMark, .navList button, .memoryNote strong { color: #41454d; } .navList button.active { background: #fff; color: #202124; } .memoryNote, .navList button:last-child { border-color: #d8dadf; }' });
  await capture('gallery-light-variant');
  await lightVariant.evaluate((node) => node.parentNode?.removeChild(node));
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  const tiles = page.locator('.mediaTile');
  const boxes = await tiles.evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
  const secondRow = boxes.findIndex((box) => box.y > boxes[0].y + 4);
  await page.mouse.move(boxes[0].x + 20, boxes[0].y + 20);
  await page.mouse.down();
  await page.mouse.move(boxes[secondRow].x + 20, boxes[secondRow].y + 20, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(secondRow * 2);
  await page.getByRole('button', { name: '선택 끝내기' }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await expect(page.getByRole('button', { name: /앨범 만들기/ })).toBeEnabled();
  await capture('selection');
  await page.getByRole('button', { name: '선택 끝내기' }).click();
  await page.locator('.mediaTile').first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await capture('detail');
  const photo = await page.locator('.detailPhotoPane').boundingBox();
  const footer = await page.locator('.detailBody').boundingBox();
  expect(footer!.y).toBeGreaterThanOrEqual(photo!.y + photo!.height - 1);
  const heart = await page.getByTitle('즐겨찾기', { exact: true }).locator('svg').boundingBox();
  expect(heart!.width).toBeGreaterThanOrEqual(18);
  await page.getByTitle('댓글', { exact: true }).click();
  await expect(page.locator('#photoComments')).toHaveCount(0);
  expect((await page.locator('.detailPhotoPane').boundingBox())!.height).toBeGreaterThan(photo!.height);
  await capture('detail-focused');
  await page.getByTitle('댓글', { exact: true }).click();
  await page.getByTitle('닫기').click();
  await page.getByRole('button', { name: '시간순', exact: true }).click();
  await page.locator('.stripItem').first().hover();
  await page.waitForTimeout(200);
  expect(await page.locator('.stripItem').first().evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  await capture('timeline-hover');
  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await page.getByRole('tab', { name: '달력보기' }).click();
  await capture('calendar');
  await page.getByRole('button', { name: '일정 등록', exact: true }).click();
  await page.getByLabel('매년 반복').check();
  await capture('event');
  await page.getByTitle('닫기').click();
  await page.getByRole('tab', { name: '앨범보기' }).click();
  await page.locator('.albumMountedPhoto .mediaImage').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  await capture('reader');
  const book = await page.locator('.binderStage').boundingBox();
  const pager = await page.locator('.albumReaderControls').boundingBox();
  expect(book!.y + book!.height).toBeLessThan(pager!.y);
  const header = await page.locator('.albumFullscreenHeader').boundingBox();
  const close = await page.locator('.albumFullscreen').getByTitle('닫기').boundingBox();
  expect(close!.y + close!.height).toBeLessThanOrEqual(header!.y + header!.height);
  await page.getByTitle('다음 책장', { exact: true }).click();
  await expect(page.locator('.binderStage')).toHaveAttribute('data-turn-phase', 'departing');
  await expect(page.locator('.albumMountedPhoto[data-side="right"]').first()).toHaveCSS('opacity', '0');
  await page.waitForTimeout(120);
  await expect(page.locator('.albumMountedPhoto[data-side="left"]').first()).toHaveCSS('opacity', '0');
  await capture('reader-turn-empty');
  await page.waitForTimeout(220);
  await expect(page.locator('.binderStage')).toHaveAttribute('data-turn-phase', 'arriving');
  await capture('reader-turn-mid');
  await expect(page.locator('.albumPager')).toHaveText('2 / 5 책장');
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await expect(page.locator('.binderPage.left .binderPageNumber')).toHaveText('3');
  await expect(page.locator('.binderPage.right .binderPageNumber')).toHaveText('4');
  await page.waitForTimeout(500);
  await expect(page.locator('.binderTurnLayer')).toHaveCount(0);
  await page.getByTitle('다음 책장', { exact: true }).click();
  await page.getByRole('button', { name: '다시 섞기' }).click();
  await page.waitForTimeout(900);
  await expect(page.locator('.albumPager')).toHaveText('1 / 5 책장');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.albumPager')).toHaveText('2 / 5 책장');
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.albumPager')).toHaveText('1 / 5 책장');
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeEnabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.albumPager')).toHaveText('2 / 5 책장');
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await page.locator('.albumMountedPhoto').first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  await expect(page.locator('.albumPager')).toHaveText('2 / 5 책장');
  await page.keyboard.press('Escape');
  await expect(page.locator('.photoLightbox')).toHaveCount(0);
  await expect(page.locator('.albumFullscreen')).toBeVisible();
  await page.getByTitle('닫기').click();
  await expect(page.getByRole('tab', { name: '모아보기' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.locator('.frontAlbum')).toHaveCount(9);
  await page.evaluate(() => document.fonts.load('26px "Album Handwriting"'));
  const cover = await page.locator('.frontAlbumCover').first().boundingBox();
  const title = await page.locator('.frontAlbumTitle').first().boundingBox();
  await expect(page.locator('.frontAlbumCover').first().locator('.frontAlbumWindow')).toHaveCount(1);
  const windowBox = await page.locator('.frontAlbumWindow').first().boundingBox();
  expect(windowBox!.x).toBeGreaterThan(cover!.x);
  expect(windowBox!.y).toBeGreaterThan(cover!.y);
  expect(windowBox!.x + windowBox!.width).toBeLessThan(cover!.x + cover!.width);
  expect(windowBox!.y + windowBox!.height).toBeLessThan(title!.y);
  await expect(page.locator('.frontAlbum').first()).toHaveCSS('transform', 'none');
  await page.locator('.savedAlbumOpen').first().hover();
  await expect(page.locator('.frontAlbum').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.frontAlbum').first()).toHaveCSS('transform', 'none');
  expect(await page.locator('.frontAlbum').first().evaluate((element) => getComputedStyle(element).filter)).not.toBe('none');
  await capture('albums');
  await page.getByRole('button', { name: '우리의 봄 앨범 열기', exact: true }).click();
  await expect(page.locator('.albumFullscreen')).toBeVisible();
  await expect(page.locator('.bookSpread, .bookPage, .leftPage, .rightPage')).toHaveCount(0);
  await page.getByTitle('닫기').click();
});

test('fabric covers use one cover window for every album', async ({ page }) => {
  await page.addInitScript(() => {
    const media = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, file_path: `C:/cover-${index}.jpg`, file_type: 'image', taken_at: '2026-09-01', width: 640, height: 480, duration: null, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return Array.from({ length: 5 }, (_, count) => ({ id: count + 1, title: '우리 가족이 함께 남긴 소중한 봄날의 추억', description: '', cover_color: count % 2 ? '#334239' : '#AFC5CF', created_at: '2026-09-01', items: media.slice(0, count) }));
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.locator('.frontAlbumCover')).toHaveCount(5);
  await page.evaluate(() => document.fonts.load('26px "Album Handwriting"'));
  for (let count = 0; count <= 4; count++) {
    const album = page.locator('.frontAlbumCover').nth(count);
    await expect(album.locator('.frontAlbumWindow')).toHaveCount(1);
    await expect(album.locator('.frontAlbumSpine')).toHaveCount(1);
  }
  await page.screenshot({ path: `test-results/fabric-cover-counts-${test.info().project.name}.png` });
});
