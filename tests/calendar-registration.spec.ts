import { expect, test, type Page } from '@playwright/test';

async function photoView(page: Page) {
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
}
async function month(page: Page, year: string, value: string) {
  await page.getByRole('tab', { name: '달력', exact: true }).click();
  await page.locator('.monthPicker').getByLabel('연도', { exact: true }).selectOption(year);
  await page.locator('.monthPicker').getByLabel('월', { exact: true }).selectOption(value);
}
async function fixture(page: Page, initiallyRegistered = false) {
  await page.addInitScript(({ initiallyRegistered }) => {
    const media = ['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-03'].map((date, index) => ({ id: index + 1, file_path: `C:/trip-${index + 1}.${index === 2 ? 'mp4' : 'jpg'}`, file_type: index === 2 ? 'video' : 'image', taken_at: date, width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    let registered = initiallyRegistered || localStorage.getItem('registration-test-imported') ? media : [];
    let albums: any[] = JSON.parse(localStorage.getItem('registration-test-albums') ?? '[]');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return registered;
        if (command === 'list_albums') return albums;
        if (command === 'plugin:dialog|open') return media.map(item => item.file_path);
        if (command === 'register_paths') { registered = media; localStorage.setItem('registration-test-imported', 'true'); return registered; }
        if (command === 'assign_media_region') {
          document.documentElement.dataset.importRegions = JSON.stringify(args);
          registered = registered.map(item => args.ids.includes(item.id) ? { ...item, region_code: args.regionCode, district: args.district, location_source: 'manual', location_status: 'ready' } : item);
        }
        if (command === 'create_album_from_media') {
          const id = albums.length + 1;
          albums.push({ id, title: args.title, cover_color: args.coverColor, description: '', created_at: '2026-10-04', items: media.filter(item => args.mediaIds.includes(item.id)) });
          localStorage.setItem('registration-test-albums', JSON.stringify(albums));
          return id;
        }
        return [];
      },
    } });
  }, { initiallyRegistered });
}

test('file import assigns both photos and video districts and persists consecutive calendar labels', async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto('/');
  await photoView(page);
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  const form = page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
  if (testInfo.project.name === 'mobile') {
    await expect(form.getByLabel('촬영 위치 자동 등록 안내')).toBeVisible();
    await expect(form.getByLabel('촬영 위치 자동 등록 안내')).toContainText('위치 태그');
  }
  await form.getByLabel('가져올 기록의 시도').selectOption('KR-49');
  await form.getByLabel('가져올 기록의 시군구').selectOption('서귀포시');
  await form.getByRole('checkbox', { name: /달력에 등록하기/ }).check();
  await form.getByLabel('달력 라벨', { exact: true }).fill('제주 여행');
  await form.getByRole('button', { name: '파일 선택' }).click();
  await expect(form).toBeHidden();
  expect(JSON.parse((await page.locator('html').getAttribute('data-import-regions'))!).ids).toEqual([1, 2, 3, 4]);
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')!));
  expect(records.map((record: any) => [record.startDate, record.endDate])).toEqual([['2026-05-30', '2026-06-01'], ['2026-06-03', '2026-06-03']]);
  await month(page, '2026', '06');
  await expect(page.locator('.calendarPeriodBar')).toHaveCount(2);
  await expect(page.locator('.calendarPeriodBar.continuesBefore')).toHaveAttribute('data-span', '1');
  await expect(page.getByRole('button', { name: '2026년 6월 1일, 영상 1개', exact: true }).locator('.calendarVideoCount')).toHaveText('영상 1개');
  await expect(page.locator('.calendarGrid img')).toHaveCount(0);
  await page.screenshot({ path: `test-results/calendar-registration-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  await photoView(page);
  await month(page, '2026', '05');
  await expect(page.locator('.calendarPeriodBar')).toHaveCount(2);
  await page.locator('.calendarPeriodBar').first().click();
  const details = page.getByRole('dialog');
  await expect(details.getByRole('heading', { name: '제주 여행', exact: true })).toBeVisible();
  await expect(details.locator('.calendarDayHeader')).toContainText('사진 2장 · 영상 1개');
  await details.getByRole('button', { name: '등록 해제' }).click();
  await expect(page.locator('.calendarPeriodBar')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oraedameun.calendarRegistrations-v1')!).length)).toBe(1);
});

test('album creation can register an explicit one-day label without changing original photo dates', async ({ page }) => {
  await fixture(page, true);
  await page.goto('/');
  await photoView(page);
  await expect(page.locator('.mediaTile').first()).toBeVisible();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await page.getByRole('button', { name: '앨범 만들기', exact: true }).click();
  const form = page.getByRole('dialog', { name: '앨범 만들기', exact: true });
  await form.getByLabel('제목', { exact: true }).fill('하루의 기억');
  await form.getByRole('checkbox', { name: /달력에 등록하기/ }).check();
  await form.getByLabel('달력 등록 날짜 방식').selectOption('range');
  await form.getByLabel('달력 시작일').fill('2026-06-05');
  await form.getByLabel('달력 종료일').fill('2026-06-05');
  await form.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('.savedAlbumTitle')).toHaveText('하루의 기억');
  await photoView(page);
  await month(page, '2026', '06');
  const label = page.locator('.calendarPeriodBar');
  await expect(label).toHaveAttribute('data-span', '1');
  await expect(label).toHaveText('하루의 기억');
  await expect(page.getByRole('button', { name: '2026년 6월 3일, 사진 1장', exact: true })).toBeVisible();
  await label.click();
  await expect(page.getByRole('dialog').locator('.calendarDayHeader')).toContainText('사진 1장');
});

test('overlapping period labels remain separate and wrap through weeks on a narrow screen', async ({ page }) => {
  await fixture(page, true);
  await page.addInitScript(() => {
    localStorage.setItem('oraedameun.calendarRegistrations-v1', JSON.stringify([
      { id: 'trip', title: '긴 가족 여행', startDate: '2026-06-01', endDate: '2026-06-10', mediaIds: ['1', '3'], color: '#2F4058' },
      { id: 'day', title: '하루 기록', startDate: '2026-06-03', endDate: '2026-06-03', mediaIds: ['4'], color: '#8A2E35' },
    ]));
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await photoView(page);
  await month(page, '2026', '06');
  const longBars = page.locator('[data-record-id="trip"]');
  await expect(longBars).toHaveCount(2);
  await expect(longBars.first()).toHaveAttribute('data-span', '6');
  await expect(longBars.last()).toHaveAttribute('data-span', '4');
  const oneDay = page.locator('[data-record-id="day"]');
  await expect(oneDay).toHaveAttribute('data-span', '1');
  const first = (await longBars.first().boundingBox())!;
  const second = (await oneDay.boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  const cell = (await page.getByRole('button', { name: '2026년 6월 3일, 사진 1장', exact: true }).boundingBox())!;
  expect(second.x).toBeGreaterThanOrEqual(cell.x);
  expect(second.x + second.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/calendar-periods-${test.info().project.name}.png`, fullPage: true });
});

test('calendar persistence failure keeps the successfully imported media', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'oraedameun.calendarRegistrations-v1') throw new DOMException('Full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/');
  await photoView(page);
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  const form = page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
  await form.getByRole('checkbox', { name: /달력에 등록하기/ }).check();
  await form.getByRole('button', { name: '파일 선택' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('사진과 영상은 가져왔지만 달력에 등록하지 못했습니다');
  await expect(page.getByRole('dialog', { name: '사진·영상 가져오는 중' })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('registration-test-imported'))).toBe('true');
});
