import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page) {
  await page.route('**/phone-layout-*.jpg', route => route.fulfill({
    path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg',
  }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 48 }, (_, index) => ({
      id: index + 1, file_path: `C:/phone-layout-${index + 1}.jpg`, file_type: 'image',
      taken_at: '2026-09-25', width: 600, height: 900, size_bytes: 1000,
      rating: 0, comment: '', favorite: false, metadata_status: 'ready',
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums' ? [
        { id: 1, title: '모바일 앨범', description: '', created_at: '2026-09-25', items: media.slice(0, 11) },
      ] : [],
    } });
  });
  await page.goto('/');
}

test('touch swipes scroll selection mode without selecting photos, while taps toggle once', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Real touch gestures are checked on the phone profile.');
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  const first = page.locator('.mediaTile').first();
  await first.scrollIntoViewIfNeeded();
  const box = (await first.boundingBox())!;
  const startY = Math.min(box.y + box.height - 10, page.viewportSize()!.height - 100);
  const x = box.x + box.width / 2;
  const before = await page.evaluate(() => scrollY);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - step * 22 }] });
    await page.waitForTimeout(20);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 40);
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(0);
  await page.locator('.mediaTile').nth(8).tap();
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(1);
  await page.locator('.mediaTile').nth(8).tap();
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(0);
  await page.locator('.mediaTile').nth(8).tap();
  await page.locator('.mediaTile').nth(9).tap();
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(2);
  await client.detach();
});

test('mouse drag selection and keyboard selection still work on desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Mouse drag coverage belongs to the desktop profile.');
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  const tiles = page.locator('.mediaTile');
  await tiles.first().scrollIntoViewIfNeeded();
  const first = (await tiles.first().boundingBox())!;
  const next = (await tiles.nth(1).boundingBox())!;
  await page.mouse.move(first.x + 15, first.y + 15);
  await page.mouse.down();
  await page.mouse.move(next.x + 15, next.y + 15, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(2);
  await tiles.nth(2).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.mediaTile.multiSelected')).toHaveCount(3);
});

test('import header and actions stay visible when options scroll on short phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Phone viewport regression.');
  await page.setViewportSize({ width: 360, height: 640 });
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
  await expect(dialog.locator('.mediaImportHeader')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '파일 선택', exact: true })).toBeInViewport();
  await expect(dialog.getByLabel('촬영 위치 자동 등록 안내')).toBeInViewport();
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByRole('checkbox', { name: /달력에 등록하기/ }).check();
  await dialog.getByLabel('달력 등록 날짜 방식').selectOption('range');
  await dialog.locator('.mediaImportBody').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.locator('.mediaImportHeader')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '파일 선택', exact: true })).toBeInViewport();
  const body = (await dialog.locator('.mediaImportBody').boundingBox())!;
  const actions = (await dialog.locator('.mediaImportActions').boundingBox())!;
  expect(body.y + body.height).toBeLessThanOrEqual(actions.y + 1);
  await page.screenshot({ path: 'preview-results/mobile-import-layout.png' });
  // Simulate the smaller visual viewport reported while a keyboard is open.
  await page.evaluate(() => document.documentElement.style.setProperty('--app-viewport-height', '390px'));
  await expect(dialog.getByRole('button', { name: '파일 선택', exact: true })).toBeInViewport();
  expect((await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(390);
});

test('phones retain the bound two-page album and keep pager controls inside the screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Phone portrait and landscape regression.');
  await fixture(page);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '모바일 앨범 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창', exact: true });
  for (const size of [{ width: 320, height: 740 }, { width: 393, height: 851 }, { width: 851, height: 393 }]) {
    await page.setViewportSize(size);
    await expect(reader.locator('.albumBookBase')).toBeVisible();
    const left = (await reader.locator('.albumPaper.left').boundingBox())!;
    const right = (await reader.locator('.albumPaper.right').boundingBox())!;
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
    const book = (await reader.locator('.albumBookStage').boundingBox())!;
    const header = (await reader.locator('.albumJournalHeader').boundingBox())!;
    const footer = (await reader.locator('.albumJournalPager').boundingBox())!;
    expect(book.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(book.y + book.height).toBeLessThanOrEqual(footer.y + 1);
    await expect(reader.getByRole('button', { name: '다음', exact: true })).toBeInViewport();
    await expect(reader.getByLabel('앨범 책장 이동')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `preview-results/mobile-album-${size.width}x${size.height}.png` });
  }
  await reader.getByRole('button', { name: '다음', exact: true }).click();
  await expect(reader.locator('.albumPagerActions p')).toHaveText('2 / 2 펼침');
  await expect(reader.locator('.albumSpread')).toHaveAttribute('aria-busy', 'false');
  await reader.locator('.albumPagePhoto').first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세', exact: true })).toBeVisible();
});
