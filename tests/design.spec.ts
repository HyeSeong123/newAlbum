import { expect, test } from '@playwright/test';
import { ALBUM_TURN_TIMING } from '../src/features/albums/albumAnimation';

test('redesigned views fit and retain photo workflows', async ({ page }, info) => {
  const single = info.project.name === 'mobile';
  const unit = single ? '페이지' : '펼침';
  await page.route('**/design-photo-*.jpg', (route) => {
    const index = Number(route.request().url().match(/design-photo-(\d+)/)![1]);
    return route.fulfill({ path: `node_modules/@vladmandic/face-api/demo/sample${index % 6 + 1}.jpg`, contentType: 'image/jpeg' });
  });
  await page.addInitScript(() => {
    Math.random = () => 1234 / 0x100000000;
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
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
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
    expect(nav!.height).toBe(70);
    await expect(page.locator('.sidebar .navList button').first()).toHaveCSS('font-size', '14px');
    const tabs = await page.locator('.viewTabs').boundingBox();
    const actions = await page.locator('.collectionTools').boundingBox();
    expect(Math.abs(tabs!.y + tabs!.height / 2 - actions!.y - actions!.height / 2)).toBeLessThan(4);
  }
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  const tiles = page.locator('.mediaTile');
  await tiles.first().evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
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
  const sidebar = await page.locator('.detailSidebar').boundingBox();
  if (test.info().project.name === 'mobile') expect(sidebar!.y).toBeGreaterThanOrEqual(photo!.y + photo!.height - 1);
  else expect(sidebar!.x).toBeGreaterThanOrEqual(photo!.x + photo!.width - 1);
  const heart = await page.getByTitle('즐겨찾기', { exact: true }).locator('svg').boundingBox();
  expect(heart!.width).toBeGreaterThanOrEqual(18);
  await expect(page.locator('.commentBox, .commentForm')).toHaveCount(0);
  await page.getByTitle('닫기').click();
  await page.getByRole('tab', { name: '달력' }).click();
  await capture('calendar');
  await page.locator('.calendarDay').first().click();
  await capture('day-record');
  await page.getByTitle('닫기').click();
  await page.getByRole('tab', { name: '책 보기' }).click();
  const totalPages = Number(await page.getByRole('slider', { name: '앨범 책장 이동' }).getAttribute('max'));
  await page.locator('.albumPagePhoto .mediaImage').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  await capture('reader');
  const book = await page.locator('.albumSpread').boundingBox();
  const pager = await page.locator('.albumJournalPager').boundingBox();
  expect(book!.y + book!.height).toBeLessThan(pager!.y);
  const header = await page.locator('.albumJournalHeader').boundingBox();
  const close = await page.locator('.albumJournal').getByTitle('닫기').boundingBox();
  expect(close!.y + close!.height).toBeLessThanOrEqual(header!.y + header!.height);
  // Keep application timers still while screenshots capture the intermediate pages.
  await page.clock.install();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.getByTitle('다음 책장', { exact: true }).click();
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'departing');
  if (!single) await expect(page.locator('.albumPhotoEntry[data-side="right"]').first()).toHaveCSS('opacity', '0');
  await expect(page.locator('.albumPhotoEntry[data-side="left"]').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.albumTurnFace')).toHaveCount(2);
  await capture('reader-turn-start');
  await page.clock.runFor(ALBUM_TURN_TIMING.swap);
  await expect(page.locator('.albumSpread')).toHaveAttribute('data-turn-phase', 'arriving');
  await capture('reader-turn-mid');
  await page.clock.runFor(ALBUM_TURN_TIMING.duration - ALBUM_TURN_TIMING.swap);
  await page.clock.resume();
  await expect(page.locator('.albumPagerActions p')).toHaveText(`2 / ${totalPages} ${unit}`);
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await expect(page.locator('.albumPaper.left .albumPageNumber')).toHaveText(single ? '02' : '03');
  if (!single) await expect(page.locator('.albumPaper.right .albumPageNumber')).toHaveText('04');
  await page.waitForTimeout(500);
  await expect(page.locator('.albumTurningSheet')).toHaveCount(0);
  await page.getByTitle('다음 책장', { exact: true }).click();
  await page.getByRole('button', { name: '앨범 보기 옵션' }).click();
  await page.getByRole('button', { name: '사진 순서 섞기' }).click();
  await page.waitForTimeout(ALBUM_TURN_TIMING.duration + 100);
  await expect(page.locator('.albumPagerActions p')).toHaveText(`1 / ${totalPages} ${unit}`);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.albumPagerActions p')).toHaveText(`2 / ${totalPages} ${unit}`);
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.albumPagerActions p')).toHaveText(`1 / ${totalPages} ${unit}`);
  await expect(page.getByTitle('다음 책장', { exact: true })).toBeEnabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.albumPagerActions p')).toHaveText(`2 / ${totalPages} ${unit}`);
  await expect(page.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await page.locator('.albumPagePhoto').first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  await expect(page.locator('.albumPagerActions p')).toHaveText(`2 / ${totalPages} ${unit}`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.photoLightbox')).toHaveCount(0);
  await expect(page.locator('.albumJournal')).toBeVisible();
  await page.getByTitle('닫기').click();
  await expect(page.getByRole('tab', { name: '사진 모아보기' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.locator('.savedAlbumCard')).toHaveCount(9);
  await expect(page.locator('.savedAlbumOpen .frontAlbumWindow img').first()).toHaveCSS('object-fit', 'cover');
  await expect(page.locator('.savedAlbumOpen .frontAlbumBase')).toHaveCount(9);
  await expect(page.locator('.savedAlbumFooter .actionMenuTrigger')).toHaveCount(9);
  await expect(page.getByText('책으로 보기', { exact: true })).toHaveCount(0);
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await expect(page.getByRole('button', { name: '앨범 수정', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await capture('albums');
  await page.getByRole('button', { name: '우리의 봄 앨범 열기', exact: true }).click();
  await expect(page.locator('.albumJournal')).toBeVisible();
  await expect(page.locator('.bookSpread, .bookPage, .leftPage, .rightPage')).toHaveCount(0);
  await page.getByTitle('닫기').click();
});

test('album cards handle empty covers and varying photo counts', async ({ page }) => {
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
  await expect(page.locator('.savedAlbumCard')).toHaveCount(5);
  await expect(page.locator('.savedAlbumCard').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.savedAlbumCard').first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.savedAlbumCard').first()).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.savedAlbumOpen .frontAlbumWindow img')).toHaveCount(4);
  await expect(page.locator('.savedAlbumFooter .actionMenuTrigger')).toHaveCount(5);
  if (page.viewportSize()!.width >= 1100) {
    const cover = await page.locator('.savedAlbumCard').first().boundingBox();
    expect(cover!.width).toBeGreaterThanOrEqual(400);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/fabric-cover-counts-${test.info().project.name}.png` });
});
