import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/map-photo-*.jpg', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#e1e7d1"/><circle cx="240" cy="180" r="95" fill="#9aaa77"/></svg>' }));
  await page.addInitScript(() => {
    const media = [
      { id: 1, region_code: 'KR-11', region_name: '서울특별시', location_status: 'ready', title: '서울 산책', file_type: 'image' },
      { id: 2, region_code: 'KR-49', region_name: '제주특별자치도', location_status: 'ready', title: '제주 바다', file_type: 'image' },
      { id: 3, region_code: null, region_name: null, location_status: 'no-gps', title: '사진관', file_type: 'image' },
      { id: 4, region_code: null, region_name: null, location_status: 'queued', title: '제주 여행 영상', file_type: 'video' },
    ].map((entry, index) => ({ file_path: `C:/map-photo-${index + 1}.jpg`, taken_at: `2026-09-0${index + 1}`,
      width: 480, height: 360, size_bytes: 128000, rating: 0, favorite: false, comment: '', view_count: 0,
      metadata_status: 'ready', ...entry }));
    let analyzed = false;
    const summary = () => ({ total: 4, analyzed: analyzed ? 4 : 3, pending: analyzed ? 0 : 1, failed: 0,
      unclassified: 1, regions: [
        { code: 'KR-11', name: '서울특별시', photos: 1, videos: 0 },
        { code: 'KR-49', name: '제주특별자치도', photos: 1, videos: analyzed ? 1 : 0 },
      ] });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string, args: { id?: number; regionCode?: string; offset?: number; limit?: number }) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'location_overview') return summary();
        if (command === 'analyze_locations') { analyzed = true; return summary(); }
        if (command === 'list_region_media') return media.filter(entry =>
          args.regionCode === 'unclassified' ? entry.location_status === 'no-gps' :
            entry.region_code === args.regionCode || (analyzed && entry.id === 4 && args.regionCode === 'KR-49'))
          .slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 48));
        if (command === 'media_thumbnail') return `C:/map-photo-${args.id}.jpg`;
        if (command === 'increment_media_view') return 1;
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '추억 지도' }).click();
});

test('province counts, region gallery, unclassified list and existing detail stay connected', async ({ page }) => {
  await expect(page.locator('.memoryMapRegion')).toHaveCount(17);
  await expect(page.getByText('17개 지역 중 2개 지역에 기록이 있어요.')).toBeVisible();
  await expect(page.locator('.memoryMapGallery')).toHaveCount(0);
  await page.locator('.memoryMapRegion[aria-label^="제주특별자치도"]').click();
  await expect(page.locator('.memoryMapGallery')).toContainText('제주특별자치도');
  await expect(page.locator('.memoryMapGallery .recordMediaGrid > button')).toHaveCount(1);
  await page.getByRole('button', { name: '제주 바다 상세보기' }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await expect(detail.locator('.detailFileName')).toHaveText('map-photo-2.jpg');
  await expect(detail.locator('.detailImageCanvas img')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.memoryMapUnclassified').click();
  await expect(page.locator('.memoryMapGallery')).toContainText('지역 미분류');
  await expect(page.locator('.memoryMapGallery .recordMediaGrid > button')).toHaveCount(1);
  await expect(page.locator('.memoryMapGallery')).toContainText('사진관');
  await page.locator('.memoryMapAll').click();
  await expect(page.locator('.memoryMapGallery')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('existing photos are analyzed in batches, totals refresh and video is listed', async ({ page }) => {
  await expect(page.locator('.memoryMapAnalysis')).toContainText('3 / 4');
  await page.getByRole('button', { name: '위치 정보 분석', exact: true }).click();
  await expect(page.locator('.memoryMapAnalysis')).toHaveCount(0);
  await page.locator('.memoryMapPlaceList button').filter({ hasText: '제주' }).click();
  await expect(page.locator('.memoryMapGallery')).toContainText('1장의 사진 · 1개의 영상');
  await expect(page.locator('.memoryMapGallery .recordMediaGrid > button')).toHaveCount(2);
});
