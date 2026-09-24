import { expect, test, type Page } from '@playwright/test';

test('journal days show three representative photos before expanding', async ({ page }) => {
  await page.route('**/journal-preview-*.jpg', (route) => route.fulfill({
    path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg',
    contentType: 'image/jpeg',
  }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      file_path: `C:/journal-preview-${index}.jpg`,
      file_type: 'image',
      taken_at: index < 7 ? '2026-09-12' : '2026-09-06',
      width: index === 0 ? 900 : 640,
      height: index === 0 ? 600 : 480,
      duration: null,
      size_bytes: 1000,
      rating: 0,
      comment: '',
      favorite: false,
      metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [
          { id: 1, title: '가을 기록', description: '', cover_color: '#D8DDCB', created_at: '2026-09-12', items: media.slice(0, 7) },
          { id: 2, title: '주말의 기억', description: '', cover_color: '#6A4538', created_at: '2026-09-06', items: media.slice(7) },
        ];
        return [];
      },
    } });
  });

  await page.goto('/');
  const day = page.locator('.journalDay').first();
  await expect(day.locator('.mediaTile')).toHaveCount(3);
  if (test.info().project.name === 'desktop') {
    const boxes = await day.locator('.mediaTile').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width };
    }));
    expect(boxes[0].width / boxes[1].width).toBeCloseTo(1.8, 1);
    expect(Math.abs(boxes[1].x - boxes[2].x)).toBeLessThan(2);
    expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
    const nextDay = await page.locator('.journalDay').nth(1).locator('.mediaTile').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
    expect(Math.max(...nextDay) - Math.min(...nextDay)).toBeLessThan(1);
    const mosaic = day.locator('.journalMosaic');
    expect((await mosaic.boundingBox())!.height).toBeLessThanOrEqual(431);
    await expect(page.locator(".quickAlbum .frontAlbumBase").first()).toHaveAttribute("src", /album-front-flat/);
    await page.setViewportSize({ width: 2191, height: 1258 });
    expect((await mosaic.boundingBox())!.height).toBeLessThanOrEqual(431);
    expect((await page.locator('.workspace').boundingBox())!.width).toBeLessThanOrEqual(1600);
    await page.screenshot({ path: 'test-results/journal-preview-wide.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const more = day.getByRole('button', { name: '기록 4개 더보기' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: `test-results/journal-preview-${test.info().project.name}.png`, fullPage: true });
  await more.click();
  await expect(day.locator('.mediaTile')).toHaveCount(7);
  await expect(day.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
});

test('month navigation and album shortcuts keep their own scope', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [
      { id: 1, file_path: 'C:/september.jpg', taken_at: '2026-09-12' },
      { id: 2, file_path: 'C:/may.jpg', taken_at: '2026-05-31' },
      { id: 3, file_path: 'C:/undated.jpg', taken_at: null },
    ].map((item) => ({ ...item, file_type: 'image', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums' ? [{ id: 1, title: '한 권의 기록', cover_color: '#E5E1D5', created_at: '2026-09-12', description: '', items: media }] : [],
    } });
  });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('2026년 9월');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await page.getByRole('button', { name: '2026년 5월', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('2026년 5월');
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '2');
  await page.getByRole('button', { name: '날짜 없음', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveAttribute('data-media-id', '3');
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  await page.getByRole('textbox', { name: '사진과 추억 검색' }).fill('may');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await page.getByRole('button', { name: '검색 지우기' }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  if (test.info().project.name === 'desktop') {
    await page.getByRole('button', { name: '모두 보기', exact: true }).click();
    await expect(page.locator('.savedAlbumCard')).toHaveCount(1);
    await expect(page.locator('.albumJournal')).toHaveCount(0);
  }
});

test('album reader preserves order and supports list, scrubber and nested photo navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const media = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, file_path: `C:/record-${i + 1}.jpg`, file_type: 'image', taken_at: '2026-09-12', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: i === 0 ? '바람이 좋았던 날' : '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => command === 'list_media' ? media : [],
    } });
  });
  await page.goto('/');
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  await expect(page.getByRole('tablist', { name: '사진 보기 방식' }).getByRole('tab')).toHaveCount(3);
  await page.getByRole('tab', { name: '전체 앨범', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumPagePhoto').first()).toHaveAttribute('aria-label', 'record-1.jpg 상세보기');
  await expect(reader.locator('.albumPageCaption').first()).toContainText('바람이 좋았던 날');
  const slider = reader.getByRole('slider', { name: '앨범 책장 이동' });
  const total = Number(await slider.getAttribute('max'));
  expect(total).toBeGreaterThanOrEqual(3);
  await slider.fill(String(total));
  await expect(reader.locator('.albumPagerActions p')).toHaveText(`${total} / ${total} 펼침`);
  expect(await reader.locator('.albumPagePhoto').count()).toBeGreaterThanOrEqual(1);
  expect(await reader.locator('.albumPagePhoto').count()).toBeLessThanOrEqual(3);
  await expect(reader.getByRole('button', { name: 'record-9.jpg 상세보기' })).toBeVisible();
  await reader.getByRole('button', { name: '사진 목록', exact: true }).click();
  await expect(reader.locator('.albumPhotoList > button')).toHaveCount(9);
  await reader.locator('.albumPhotoList > button').first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detailFileName')).toHaveText('record-2.jpg');
  await page.keyboard.press('Escape');
  await expect(reader).toBeVisible();
  await reader.getByRole('button', { name: '책으로 보기', exact: true }).click();
  await expect(reader.locator('.albumPagerActions p')).toHaveText(`${total} / ${total} 펼침`);
  await reader.getByRole('button', { name: '앨범 보기 옵션' }).click();
  await reader.getByRole('button', { name: '사진 순서 섞기' }).click();
  await reader.getByRole('button', { name: '앨범 보기 옵션' }).click();
  await reader.getByRole('button', { name: '원래 순서로 보기' }).click();
  await expect(reader.locator('.albumPagePhoto').first()).toHaveAttribute('aria-label', 'record-1.jpg 상세보기');
});

async function mockEditableAlbum(page: Page) {
  await page.addInitScript(() => {
    let media = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, file_path: `C:/record-${i + 1}.jpg`, file_type: 'image', taken_at: '2026-09-12', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, view_count: 0, metadata_status: 'ready' }));
    const album = { id: 1, title: '함께한 가을', description: '', cover_color: '#E5E1D5', created_at: '2026-09-12', items: media.map((item) => ({ ...item })) };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: { ids?: number[] }) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [album];
        if (command === 'media_thumbnail') return '';
        if (command === 'delete_registered_media') { media = media.filter((item) => !args.ids?.includes(item.id)); return media; }
        if (command === 'clear_registered_media') { media = []; return media; }
        return null;
      },
    } });
  });
}

for (const entry of ['saved albums', 'journal shortcut']) {
  test(`${entry} reflects photo edits without moving the current spread`, async ({ page, isMobile }) => {
    test.skip(isMobile && entry === 'journal shortcut', 'The album sidebar is hidden on narrow screens.');
    await mockEditableAlbum(page);
    await page.goto('/');
    if (entry === 'saved albums') await page.getByRole('button', { name: '내 앨범', exact: true }).click();
    await page.getByRole('button', { name: '함께한 가을 앨범 열기', exact: true }).click();
    const reader = page.getByRole('dialog', { name: '앨범 전체창' });
    await reader.getByRole('slider', { name: '앨범 책장 이동' }).fill('2');
    await expect(reader.getByRole('slider', { name: '앨범 책장 이동' })).toHaveValue('2');
    const spreadLabel = await reader.locator('.albumPagerActions p').innerText();
    const photoLabel = (await reader.locator('.albumPagePhoto').first().getAttribute('aria-label'))!;
    await reader.getByRole('button', { name: photoLabel, exact: true }).click();
    const detail = page.getByRole('dialog', { name: '사진 상세' });
    await detail.getByTitle('즐겨찾기', { exact: true }).click();
    await detail.getByTitle('5점', { exact: true }).click();
    await detail.locator('.commentForm').getByLabel('작성자').fill('나');
    await detail.locator('.commentForm').getByLabel('내용').fill('바람이 좋았던 날');
    await detail.getByRole('button', { name: '댓글 등록', exact: true }).click();
    await detail.getByTitle('닫기', { exact: true }).click();

    await expect(reader.locator('.albumPagerActions p')).toHaveText(spreadLabel);
    await expect(reader.locator('.albumPageCaption').first()).toContainText('바람이 좋았던 날');
    await reader.getByRole('button', { name: photoLabel, exact: true }).click();
    await expect(detail.getByTitle('즐겨찾기', { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByTitle('5점', { exact: true }).locator('svg')).toHaveAttribute('fill', 'currentColor');
    await expect(detail.locator('.photoMetadata')).toContainText('2회');
    await expect(detail.locator('.commentItem')).toContainText('바람이 좋았던 날');
  });
}

test('unregistered photos disappear from albums and clearing leaves an empty album', async ({ page }) => {
  await mockEditableAlbum(page);
  await page.goto('/');
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.locator('.mediaTile[data-media-id="1"]').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.locator('.selectionNotice')).toContainText('1개 항목을 등록 목록에서 지웠습니다.');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '함께한 가을 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumJournalHeading')).toContainText('사진 8장');
  await expect(reader.locator('.albumPagePhoto').first()).toHaveAttribute('aria-label', 'record-2.jpg 상세보기');
  await reader.getByRole('button', { name: '사진 목록', exact: true }).click();
  await expect(reader.locator('.albumPhotoList > button')).toHaveCount(8);
  await expect(reader.getByRole('button', { name: 'record-1.jpg 상세보기' })).toHaveCount(0);

  await page.getByRole('button', { name: '설정', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '모두 비우기', exact: true }).click();
  await expect(page.getByRole('button', { name: '모두 비우기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '함께한 가을 앨범 열기', exact: true }).click();
  await expect(reader.getByText('앨범에 담긴 기록이 없습니다.', { exact: true })).toBeVisible();
  await expect(reader.locator('.albumPagePhoto')).toHaveCount(0);
});
