import { expect, test, type Page } from '@playwright/test';

async function showFixtureMonth(page: Page) {
  await page.locator('.monthPicker').getByLabel('연도', { exact: true }).selectOption('2025');
  await page.locator('.monthPicker').getByLabel('월', { exact: true }).selectOption('05');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/calendar-photo-*.jpg', (route) => {
    const id = Number(route.request().url().match(/calendar-photo-(\d+)/)![1]);
    return route.fulfill({ path: id >= 1000 ? 'tests/fixtures/pet-dog.jpg' : `node_modules/@vladmandic/face-api/demo/sample${id % 6 + 1}.jpg`, contentType: 'image/jpeg' });
  });
  await page.addInitScript(() => {
    const entry = (id: number, taken_at: string) => ({
      id, file_path: `C:/calendar-photo-${id}.jpg`, taken_at, file_type: 'image',
      width: 1200, height: 800, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready',
    });
    const media = Array.from({ length: 150 }, (_, index) => entry(index + 1, '2025-05-31'));
    for (const day of [1, 3, 4, 6, 8, 10, 11, 14, 16, 17, 18, 21, 23, 24, 25, 28, 30]) {
      for (let index = 0; index < day % 9 + 3; index++) media.push(entry(1000 + day * 10 + index, `2025-05-${String(day).padStart(2, '0')}`));
    }
    if (!localStorage.getItem('calendar-test-initialized')) {
      localStorage.setItem('oraedameun.dayNotes', JSON.stringify({ '2025-05-31': '함께 사진을 남긴 날.\n어색하게 시작했지만 웃음이 끊이지 않았다.' }));
      localStorage.setItem('calendar-test-initialized', 'true');
    }
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string, args: { id?: number }) => {
        if (command === 'list_media') return media;
        if (command === 'media_thumbnail') return `C:/calendar-photo-${args.id}.jpg`;
        return [];
      },
    } });
  });
  await page.goto('/');
  await expect(page.locator('.collectionCount')).toContainText('개의 기록');
  await expect(page.locator('h1')).toHaveText('2025년 5월');
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await showFixtureMonth(page);
});

test('calendar and day viewer follow the compact reference layout', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1694, height: 928 });
  const grid = page.locator('.calendarGrid');
  await expect(grid.locator('button')).toHaveCount(31);
  await expect(grid.locator('.emptyDay')).toHaveCount(4);
  await expect(grid.locator('.weekday')).toHaveCount(7);
  await expect(grid.locator('.hasMedia')).toHaveCount(18);
  const firstPhoto = grid.locator('.hasMedia img').first();
  await firstPhoto.scrollIntoViewIfNeeded();
  await expect(firstPhoto).toHaveAttribute('src', /calendar-photo-/);
  await firstPhoto.evaluate((image: HTMLImageElement) => image.decode());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'desktop') {
    const bounds = (await grid.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(1000);
    expect(bounds.width).toBeGreaterThan(1694 * .9);
    expect(bounds.width).toBeLessThan(1694 - 32);
    expect(Math.abs(bounds.x - (1694 - bounds.width) / 2)).toBeLessThan(2);
    expect(bounds.height).toBeGreaterThan(600);
  }
  await page.screenshot({ path: `test-results/calendar-month-${testInfo.project.name}.png`, fullPage: true });

  await grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장, 메모 있음' }).click();
  const dialog = page.getByRole('dialog', { name: '2025-05-31 기록' });
  await expect(dialog.getByRole('heading')).toHaveText('2025년 5월 31일 토요일');
  await expect(dialog.getByText('사진 150장', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '이전 사진', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '다음 사진', exact: true }).click();
  await expect(dialog.locator('.calendarPhotoPosition')).toHaveText('2 / 150');
  await dialog.locator('.calendarDayVisual img').evaluate((image: HTMLImageElement) => image.decode());
  const stage = (await dialog.locator('.calendarDayStage').boundingBox())!;
  const strip = (await dialog.locator('.calendarFilmstrip').boundingBox())!;
  const memo = (await dialog.locator('.calendarDayMemo').boundingBox())!;
  expect(strip.y).toBeGreaterThan(stage.y + stage.height);
  expect(memo.y).toBeGreaterThan(strip.y + strip.height);
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 24);
  await expect(dialog.getByRole('button', { name: '대표사진으로 설정' })).toBeInViewport();
  await page.screenshot({ path: `test-results/calendar-day-${testInfo.project.name}.png` });

  await dialog.getByRole('button', { name: '다음 썸네일', exact: true }).click();
  await expect.poll(() => dialog.locator('.calendarThumbnails').evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
  await expect(dialog.getByRole('button', { name: '이전 썸네일', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.calendarPhotoPosition')).toHaveText('3 / 150');
  await expect(dialog.getByRole('button', { name: '사진 미리보기 3', exact: true })).toBeInViewport();
  await dialog.getByLabel('그날의 메모').fill('메모를 입력해도 선택 사진 유지');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('.calendarPhotoPosition')).toHaveText('3 / 150');
  await dialog.getByRole('button', { name: '메모 저장', exact: true }).click();
  await expect(dialog.locator('.calendarPhotoPosition')).toHaveText('3 / 150');
  await dialog.getByRole('button', { name: '대표사진으로 설정' }).click();
  await expect(dialog.getByRole('status')).toHaveText('대표사진을 설정했습니다.');
  const selectedId = await dialog.locator('.calendarDayOpen').getAttribute('data-media-id');
  await expect(dialog.locator('.calendarThumbnails .active .calendarCoverBadge')).toHaveText('대표');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장, 메모 있음' }).locator('i')).toHaveAttribute('data-media-id', selectedId!);

  await page.reload();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await showFixtureMonth(page);
  await grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장, 메모 있음' }).click();
  await expect(dialog.getByLabel('그날의 메모')).toHaveValue('메모를 입력해도 선택 사진 유지');
  await expect(dialog.locator('.calendarDayOpen')).toHaveAttribute('data-media-id', selectedId!);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '사진 있는 날', exact: true }).click();
  await expect(page.locator('.recordedDayGrid button')).toHaveCount(18);
  await expect(page.locator('.recordedDayGrid button').first().locator('i')).toHaveAttribute('data-media-id', selectedId!);
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  const today = new Date();
  await expect(page.locator('.calendarPanel h2')).toHaveText(`${today.getFullYear()}년 ${today.getMonth() + 1}월`);
  await expect(grid.locator('[aria-current="date"] .dayNumber')).toHaveText(String(today.getDate()));
});

test('empty dates, complete weeks and memo storage errors are handled', async ({ page }) => {
  const grid = page.locator('.calendarGrid');
  await grid.getByRole('button', { name: '2025년 5월 2일, 사진 0장' }).click();
  const dialog = page.getByRole('dialog', { name: '2025-05-02 기록' });
  await expect(dialog.getByRole('button', { name: '대표사진으로 설정' })).toBeDisabled();
  await expect(dialog.locator('.calendarFilmstrip')).toHaveCount(0);
  await dialog.getByLabel('그날의 메모').fill('사진 없이도 남겨두는 기록');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'oraedameun.dayNotes') throw new DOMException('Full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '메모 저장' }).click();
  await expect(dialog.getByRole('alert')).toContainText('저장하지 못했습니다');
  await expect(dialog.getByRole('status')).toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(grid.getByRole('button', { name: '2025년 5월 2일, 사진 0장' }).locator('.dayNoteBadge')).toHaveCount(0);
  await page.locator('.monthPicker').getByLabel('월', { exact: true }).selectOption('02');
  await expect(grid.locator('button')).toHaveCount(28);
  await expect(grid.locator('.emptyDay')).toHaveCount(7);
  await page.locator('.monthPicker').getByLabel('연도', { exact: true }).selectOption('2024');
  await expect(grid.locator('button')).toHaveCount(29);
  await expect(grid.locator('.emptyDay')).toHaveCount(6);
});

test('missing representative photos fall back without blocking the day viewer', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('oraedameun.dayCovers', JSON.stringify({ '2025-05-31': 'deleted-photo' })));
  await page.reload();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await showFixtureMonth(page);
  await page.locator('.calendarGrid').getByRole('button', { name: '2025년 5월 31일, 사진 150장, 메모 있음' }).click();
  await expect(page.locator('.calendarPhotoPosition')).toHaveText('1 / 150');
  await expect(page.locator('.calendarThumbnails button').first().locator('.calendarCoverBadge')).toBeVisible();
});

test('calendar keeps readable dates and recognizable photos at narrow and desktop sizes', async ({ page }, testInfo) => {
  const sizes = testInfo.project.name === 'mobile'
    ? [{ width: 393, height: 851 }]
    : [{ width: 1080, height: 720 }, { width: 1440, height: 960 }, { width: 1920, height: 1080 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    const measures = await page.locator('.calendarGrid .hasMedia').first().evaluate((cell) => {
      const photo = cell.querySelector('i')!;
      const date = cell.querySelector('.dayNumber')!;
      return {
        photoHeight: photo.getBoundingClientRect().height,
        photoWidth: photo.getBoundingClientRect().width,
        dateSize: parseFloat(getComputedStyle(date).fontSize),
        countSize: parseFloat(getComputedStyle(cell.querySelector('b')!).fontSize),
      };
    });
    expect(measures.dateSize, `${size.width}px 날짜`).toBeGreaterThanOrEqual(14);
    expect(measures.countSize, `${size.width}px 사진 개수`).toBeGreaterThanOrEqual(12);
    expect(measures.photoHeight, `${size.width}px 사진 높이`).toBeGreaterThan(testInfo.project.name === 'mobile' ? 35 : 50);
    expect(measures.photoWidth, `${size.width}px 사진 너비`).toBeGreaterThan(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const buttons = await page.locator('.calendarPanel .monthControls button').evaluateAll((elements) =>
      elements.map(element => getComputedStyle(element).whiteSpace));
    expect(buttons.every(value => value === 'nowrap')).toBe(true);
  }
});

test('compact calendar keeps event counts visible beside empty and busy photo dates', async ({ page }) => {
  await page.evaluate(() => {
    const event = (id: string, date: string) => ({ id, date, title: id, kind: 'appointment', showDday: false });
    localStorage.setItem('oraedameun.calendarEvents', JSON.stringify({
      '2025-05-02': [event('empty', '2025-05-02')],
      '2025-05-31': [event('first', '2025-05-31'), event('second', '2025-05-31')],
    }));
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.reload();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await showFixtureMonth(page);
  const empty = page.locator('.calendarGrid button[aria-label="2025년 5월 2일, 사진 0장, 일정 1개"]');
  const busy = page.locator('.calendarGrid button[aria-label="2025년 5월 31일, 사진 150장, 일정 2개, 메모 있음"]');
  await expect(empty.locator('.calendarCompactEvent')).toBeVisible();
  await expect(busy.locator('.calendarCompactEvent')).toHaveText('일정2');
  for (const cell of [empty, busy]) {
    const date = (await cell.locator('.dayNumber').boundingBox())!;
    const label = (await cell.locator('.dayEvents').boundingBox())!;
    expect(label.x).toBeGreaterThanOrEqual(date.x + date.width);
    expect(Math.abs(label.y - date.y)).toBeLessThan(3);
    const badge = await cell.locator('.calendarCompactEvent').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
    expect(badge.content).toBeLessThanOrEqual(badge.width);
  }
  await expect(busy.locator('i .mediaImage')).toHaveCSS('object-fit', 'contain');
  expect((await busy.locator('i').boundingBox())!.height).toBeGreaterThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 393, height: 851 });
  await expect(busy.locator('.calendarCompactEvent')).toBeVisible();
  await expect(busy.locator('i .mediaImage')).toHaveCSS('object-fit', 'contain');
  const photo = (await busy.locator('i').boundingBox())!;
  const cell = (await busy.boundingBox())!;
  expect(photo.y).toBeLessThan(cell.y + 60);
  expect(photo.height).toBeGreaterThan(50);
  const eventBadge = (await busy.locator('.dayEvents').boundingBox())!;
  expect(eventBadge.y + eventBadge.height).toBeLessThanOrEqual(photo.y);
  await page.setViewportSize({ width: 1694, height: 928 });
  const widePhoto = (await busy.locator('i').boundingBox())!;
  const wideCell = (await busy.boundingBox())!;
  expect(widePhoto.y).toBeLessThan(wideCell.y + 60);
  expect(widePhoto.height).toBeGreaterThan(60);
  const wideBadge = (await busy.locator('.dayEvents').boundingBox())!;
  expect(wideBadge.y + wideBadge.height).toBeLessThanOrEqual(widePhoto.y);
  await page.screenshot({ path: `test-results/calendar-event-${test.info().project.name}.png` });
});

test('calendar opens today regardless of the latest photo month', async ({ page }) => {
  await page.getByRole('tab', { name: '사진 모아보기', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('2025년 5월');
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  const today = await page.evaluate(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` };
  });
  await expect(page.locator('.calendarPanel h2')).toHaveText(`${today.year}년 ${today.month}월`);
  await expect(page.locator('.calendarGrid [aria-current="date"] .dayNumber')).toHaveText(String(today.day));
  await expect(page.locator('.calendarGrid [aria-current="date"]')).toBeInViewport();
  await page.getByRole('button', { name: '일정 등록', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '일정 등록' }).locator('input[type="date"]')).toHaveValue(today.key);
});

test('schedules keep photo height and their delete actions fit long titles', async ({ page }, testInfo) => {
  await page.evaluate(() => localStorage.setItem('oraedameun.calendarEvents', JSON.stringify({
    '2025-05-31': [{ id: 'long', date: '2025-05-31', title: '가족과 함께하는 아주 긴 이름의 저녁 약속과 기념일 기록'.repeat(3), kind: 'appointment', showDday: true }],
  })));
  await page.reload();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await showFixtureMonth(page);
  for (const width of testInfo.project.name === 'mobile' ? [320, 393] : [1080, 1694]) {
    await page.setViewportSize({ width, height: 900 });
    const scheduled = page.locator('.calendarGrid button.hasEvent');
    const plain = page.locator('.calendarGrid button.hasMedia:not(.hasEvent)').first();
    expect(Math.abs((await scheduled.locator('i').boundingBox())!.height - (await plain.locator('i').boundingBox())!.height)).toBeLessThan(1);
    await scheduled.click();
    const dialog = page.getByRole('dialog', { name: '2025-05-31 기록' });
    const remove = dialog.getByRole('button', { name: '삭제', exact: true });
    await remove.scrollIntoViewIfNeeded();
    await expect(remove).toBeInViewport();
    const button = (await remove.boundingBox())!;
    const row = (await dialog.locator('.eventItem').boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(row.x + row.width + 1);
    expect(await remove.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
  }
  await page.locator('.calendarGrid button.hasEvent').click();
  await page.getByRole('dialog', { name: '2025-05-31 기록' }).getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.locator('.calendarDaySchedule')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendarGrid button.hasEvent')).toHaveCount(0);
});
