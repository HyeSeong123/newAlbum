import { expect, test, type Locator, type Page } from '@playwright/test';

async function fixture(page: Page) {
  await page.addInitScript(() => {
    const media = Array.from({ length: 48 }, (_, i) => ({ id: i + 1, file_path: `/photo-${i + 1}.jpg`, file_type: 'image', taken_at: '2026-10-05', width: 800, height: 600, size_bytes: 2048, view_count: 3, title: '', rating: 0, comment: '', favorite: i === 0, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [{ id: 1, title: '추억 앨범', description: '', created_at: '2026-10-05', items: media.slice(0, 3) }];
        if (command === 'list_face_index') return { people: [{ id: 1, name: '가족' }], faces: media.map(item => ({ id: item.id, media_id: item.id, person_id: 1, thumbnail: '/favicon.svg', confirmed: true })), scanned: media.map(item => item.id) };
        if (command === 'list_pets') return [{ id: 1, name: '보리', media_ids: media.map(item => item.id), cover_media_id: 1 }];
        return [];
      },
    } });
  });
  await page.goto('/');
}

async function swipe(page: Page, tile: Locator) {
  await tile.scrollIntoViewIfNeeded();
  const box = (await tile.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height - 12, page.viewportSize()!.height - 100);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 22 }] });
    await page.waitForTimeout(20);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

async function selectPerson(page: Page) {
  await page.locator('.navList').getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '가족 48장', exact: true }).click();
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택·분리·합치기', exact: true }).click();
}

async function editPet(page: Page) {
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '반려동물 등록', exact: true }).click();
  return page.locator('.petEditor');
}

test('touch selection in people and pets scrolls without selecting, and taps toggle once', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Native touch regression on the phone profile.');
  await fixture(page);
  await selectPerson(page);
  const personTiles = page.getByRole('button', { name: '얼굴 선택', exact: true });
  await personTiles.first().scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await swipe(page, personTiles.first());
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 40);
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(0);
  await personTiles.nth(8).tap();
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(1);
  await personTiles.nth(8).tap();
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(0);
  const editor = await editPet(page);
  const pets = editor.getByRole('button', { name: '사진 선택', exact: true });
  await pets.first().scrollIntoViewIfNeeded();
  const modalBefore = await editor.evaluate(el => el.scrollTop);
  await swipe(page, pets.first());
  await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBeGreaterThan(modalBefore + 40);
  await expect(editor.locator('.petPhoto[aria-pressed="true"]')).toHaveCount(0);
  await pets.nth(8).tap();
  await expect(editor.locator('.petPhoto[aria-pressed="true"]')).toHaveCount(1);
  await pets.nth(8).tap();
  await expect(editor.locator('.petPhoto[aria-pressed="true"]')).toHaveCount(0);
});

test('desktop people and pet selection still supports mouse dragging', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop mouse regression.');
  await fixture(page);
  await selectPerson(page);
  async function drag(tiles: Locator) {
    await tiles.first().scrollIntoViewIfNeeded();
    const a = (await tiles.first().boundingBox())!, b = (await tiles.nth(1).boundingBox())!;
    await page.mouse.move(a.x + 15, a.y + 15); await page.mouse.down();
    await page.mouse.move(b.x + 15, b.y + 15, { steps: 5 }); await page.mouse.up();
  }
  await drag(page.getByRole('button', { name: '얼굴 선택', exact: true }));
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(2);
  const editor = await editPet(page);
  await drag(editor.getByRole('button', { name: '사진 선택', exact: true }));
  await expect(editor.locator('.petPhoto[aria-pressed="true"]')).toHaveCount(2);
});

test('menu arrows reveal offscreen tabs and update at both edges', async ({ page, isMobile }) => {
  await fixture(page);
  const prev = page.getByRole('button', { name: '이전 메뉴 보기', exact: true });
  const next = page.getByRole('button', { name: '다음 메뉴 보기', exact: true });
  if (!isMobile) { await expect(next).toBeHidden(); return; }
  for (const width of [393, 360, 320]) {
    await page.setViewportSize({ width, height: 851 });
    await page.locator('.navList').evaluate(el => { el.scrollLeft = 0; });
    await expect(prev).toBeDisabled(); await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => page.locator('.navList').evaluate(el => el.scrollLeft)).toBeGreaterThan(30);
    await expect(prev).toBeEnabled();
    await page.locator('.navList').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(next).toBeDisabled();
    await expect(page.locator('.navList').getByRole('button', { name: '사람과 반려동물', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: 'preview-results/mobile-polish-navigation.png', fullPage: true });
});

test('mobile hides technical metadata and fullscreen, favorites show a red heart at the photo corner', async ({ page, isMobile }) => {
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('.journalMore').first().click();
  const favorite = page.locator('.mediaTile[data-media-id="1"]');
  const badge = favorite.locator('.favoritePhotoBadge');
  await expect(badge).toBeVisible();
  await expect(badge.locator('svg')).toHaveCSS('color', 'rgb(216, 62, 82)');
  const frame = (await favorite.locator('.mediaVisual').boundingBox())!, heart = (await badge.boundingBox())!;
  expect(Math.abs(frame.x + frame.width - heart.x - heart.width - 8)).toBeLessThan(2);
  expect(Math.abs(heart.y - frame.y - 8)).toBeLessThan(2);
  await expect(page.locator('.mediaTile[data-media-id="2"] .favoritePhotoBadge')).toHaveCount(0);
  await expect(page.getByLabel('정렬 기준').locator('option[value="views"]')).toHaveCount(isMobile ? 0 : 1);
  await favorite.click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  for (const label of ['해상도', '파일 크기', '조회 수']) await expect(detail.getByText(label, { exact: true })).toHaveCount(isMobile ? 0 : 1);
  await expect(detail.locator('.favoritePhotoBadge')).toBeVisible();
  await detail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(detail.locator('.favoritePhotoBadge')).toHaveCount(0);
  await detail.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(detail.locator('.favoritePhotoBadge')).toBeVisible();
  await expect(detail.getByRole('button', { name: '즐겨찾기', exact: true })).toHaveCSS('color', 'rgb(216, 62, 82)');
  await detail.getByTitle('닫기', { exact: true }).click();
  await page.locator('.navList').getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '추억 앨범 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창', exact: true });
  await expect(reader.locator('.albumPaper .favoritePhotoBadge')).toBeVisible();
  await reader.getByRole('button', { name: '앨범 보기 옵션', exact: true }).click();
  await expect(page.getByRole('button', { name: '전체화면', exact: true })).toHaveCount(isMobile ? 0 : 1);
  await page.screenshot({ path: `preview-results/mobile-polish-favorites-${test.info().project.name}.png`, fullPage: true });
});
