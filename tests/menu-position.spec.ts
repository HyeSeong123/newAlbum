import { expect, test, type Page, type Locator } from '@playwright/test';

async function fixture(page: Page) {
  await page.route('**/menu-photo-*.jpg', route => route.fulfill({ path: 'tests/fixtures/test-photo.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    localStorage.setItem('warm-journal-diaries-v1', JSON.stringify([
      { id: 1, date: '2026-10-05', title: '하루의 기록', body: '오래 기억할 하루\n'.repeat(30), mood: '평온', weather: '맑음', album_id: null },
      { id: 2, date: '2026-10-04', title: '어제의 기록', body: '함께 걸은 길', mood: '기쁨', weather: '맑음', album_id: null },
    ]));
    const media = [1, 2].map(id => ({ id, file_path: `C:/menu-photo-${id}.jpg`, file_type: 'image', taken_at: '2026-10-05', width: 600, height: 900, size_bytes: 1000, favorite: false, rating: 0, comment: '', metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_albums'
        ? [{ id: 1, title: '가을 앨범', created_at: '2026-10-05', items: media }] : command === 'list_diary'
        ? JSON.parse(localStorage.getItem('warm-journal-diaries-v1')!) : [],
    } });
  });
  await page.goto('/');
}

async function anchored(page: Page, trigger: Locator) {
  const menu = page.locator('.actionMenuPanel');
  await expect(menu).toBeVisible();
  await expect.poll(async () => {
    const a = (await trigger.boundingBox())!, b = (await menu.boundingBox())!;
    return Math.min(Math.abs(b.y - a.y - a.height - 6), Math.abs(a.y - b.y - b.height - 6));
  }).toBeLessThan(8);
  const b = (await menu.boundingBox())!, size = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(9);
  expect(b.x + b.width).toBeLessThanOrEqual(size.width - 9);
  expect(b.y).toBeGreaterThanOrEqual(9);
  expect(b.y + b.height).toBeLessThanOrEqual(size.height - 9);
}

test('diary overflow stays beside its button after scrolling and remains clickable', async ({ page }, info) => {
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
  const trigger = page.getByRole('button', { name: '하루의 기록 일기 메뉴', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  // The transform on a hovered card used to offset a fixed descendant by the card position.
  await page.locator('.diaryCard').first().hover();
  await trigger.click();
  await anchored(page, trigger);
  await page.evaluate(() => window.scrollBy(0, 45));
  await anchored(page, trigger);
  await page.screenshot({ path: `preview-results/menu-diary-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.actionMenuPanel')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: '일기 수정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '일기 상세' })).toBeVisible();
  await expect(page.getByLabel('제목', { exact: true })).toHaveValue('하루의 기록');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await trigger.click();
  await page.locator('.diaryHeading h1').click();
  await expect(page.locator('.actionMenuPanel')).toHaveCount(0);
});

test('album overflow fits at the trigger and keeps edit available without ordering actions', async ({ page }, info) => {
  await fixture(page);
  await page.locator('.navList').getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '가을 앨범 앨범 열기', exact: true }).click();
  const trigger = page.getByRole('button', { name: '앨범 보기 옵션', exact: true });
  if (info.project.name === 'mobile') {
    const tools = (await page.locator('.albumJournalTools').boundingBox())!;
    const b = (await trigger.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(tools.y + tools.height + 1);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await trigger.click();
  await anchored(page, trigger);
  const width = (await page.locator('.actionMenuPanel').boundingBox())!.width;
  expect(width).toBeLessThan(280);
  await page.screenshot({ path: `preview-results/menu-album-${info.project.name}.png` });
  await expect(page.getByRole('button', { name: '사진 순서 섞기', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '원래 순서로 보기', exact: true })).toHaveCount(0);
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '앨범 수정', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('직접 색상 선택')).toHaveValue('#e5e1d5');
  }
});

test('phone titles, primary actions, tabs and photo tools retain one consistent row at narrow widths', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Phone toolbar geometry.');
  await fixture(page);
  for (const width of [393, 360, 320]) {
    await page.setViewportSize({ width, height: 851 });
    for (const name of ['사진 기록', '내 앨범', '일기장']) {
      await page.locator('.navList').getByRole('button', { name, exact: true }).click();
      const heading = page.locator(name === '일기장' ? '.diaryHeading h1' : '.topbar h1');
      const action = page.getByRole('button', { name: name === '일기장' ? '일기 쓰기' : name === '내 앨범' ? '새 앨범 만들기' : '사진·영상 가져오기', exact: true });
      const a = (await heading.boundingBox())!, b = (await action.boundingBox())!;
      expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(16);
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
      expect(b.height).toBeGreaterThanOrEqual(44);
      const search = page.locator(name === '일기장' ? '.diarySearch' : name === '내 앨범' ? '.topbar .searchBox' : '.libraryKeywordSearch');
      expect((await search.boundingBox())!.y).toBeGreaterThan(a.y + a.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    await page.locator('.mediaTile').first().click();
    const boxes = await page.locator('.detailActionButtons > button').evaluateAll(elements => elements.map(e => e.getBoundingClientRect().y));
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(1);
    await page.screenshot({ path: `preview-results/menu-photo-detail-${width}.png` });
    await page.getByTitle('닫기', { exact: true }).click();
  }
});
