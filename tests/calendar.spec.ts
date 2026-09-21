import { expect, test } from '@playwright/test';

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
});

test('calendar and day viewer follow the compact reference layout', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1694, height: 928 });
  const grid = page.locator('.calendarGrid');
  await expect(grid.locator('button')).toHaveCount(31);
  await expect(grid.locator('.emptyDay')).toHaveCount(4);
  await expect(grid.locator('.weekday')).toHaveCount(7);
  await expect(grid.locator('.hasMedia')).toHaveCount(18);
  await grid.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'desktop') {
    const bounds = (await grid.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(1000);
    expect(bounds.width).toBeLessThan(1100);
    expect(Math.abs(bounds.x - (1694 - bounds.width) / 2)).toBeLessThan(2);
    expect(bounds.y + bounds.height).toBeLessThan(928);
  }
  await page.screenshot({ path: `test-results/calendar-month-${testInfo.project.name}.png`, fullPage: true });

  await grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장' }).click();
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
  await expect(grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장' }).locator('i')).toHaveAttribute('data-media-id', selectedId!);

  await page.reload();
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await grid.getByRole('button', { name: '2025년 5월 31일, 사진 150장' }).click();
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
  await page.locator('.calendarGrid').getByRole('button', { name: '2025년 5월 31일, 사진 150장' }).click();
  await expect(page.locator('.calendarPhotoPosition')).toHaveText('1 / 150');
  await expect(page.locator('.calendarThumbnails button').first().locator('.calendarCoverBadge')).toBeVisible();
});
