import { expect, test } from '@playwright/test';

test('map photos are grouped by county, and the county filter opens its complete list', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [
      { id: 1, title: '담양 봄', district: '담양군', taken_at: '2025-04-01' },
      { id: 2, title: '화순 여행', district: '화순군', taken_at: '2026-09-01' },
      { id: 3, title: '담양 가을', district: '담양군', taken_at: '2026-10-01' },
    ].map(item => ({ ...item, file_path: `C:/district-${item.id}.jpg`, file_type: 'image',
      region_code: 'KR-46', region_name: '전남광주통합특별시', location_source: 'gps', location_status: 'ready',
      size_bytes: 100, rating: 0, favorite: false, comment: '', metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: { district?: string; offset?: number } = {}) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'location_overview') return { total: 3, analyzed: 3, pending: 0, failed: 0, unclassified: 0,
          regions: [{ code: 'KR-46', name: '전남광주통합특별시', photos: 3, videos: 0 }] };
        if (command === 'region_media_page') {
          const selected = args.district ? media.filter(item => item.district === args.district) : media;
          return { items: selected.slice(args.offset ?? 0), total: selected.length, years: ['2026', '2025'] };
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('group', { name: '추억 보기' }).getByRole('button', { name: '추억 지도' }).click();
  await page.locator('.memoryMapPlaceList button').filter({ hasText: '전남광주' }).click();
  const gallery = page.locator('.memoryMapGallery');
  await expect(gallery.locator('.memoryMapPlaceGroup h4')).toHaveText(['담양군', '화순군']);
  await expect(gallery.locator('.memoryMapPlaceGroup').first()).toContainText('담양 봄');
  await expect(gallery.locator('.memoryMapPlaceGroup').first()).toContainText('담양 가을');
  await gallery.getByLabel('시군구 필터').selectOption('담양군');
  await expect(gallery.locator('.recordMediaGrid > button')).toHaveCount(2);
  await expect(gallery.locator('.memoryMapPlaceGroup h4')).toHaveText(['담양군']);
});
