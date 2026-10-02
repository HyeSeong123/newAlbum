import { expect, test } from '@playwright/test';

test('memory map analyzes GPS and bulk region edits preserve coordinates', async ({ page }) => {
  await page.route('**/location-photo-*.jpg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#8bb6a7"/></svg>',
  }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1, file_path: `C:/location-photo-${index + 1}.jpg`,
      file_type: index === 2 ? 'audio' : 'image', taken_at: '2026-09-27', width: 480, height: 360,
      size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready',
      latitude: index === 0 ? 37.5665 : null, longitude: index === 0 ? 126.978 : null,
      region_code: index === 0 ? 'KR-11' : null, region_name: index === 0 ? '서울특별시' : null,
      district: '',
      location_source: 'gps', location_status: index === 1 ? 'queued' : 'ready',
    }));
    let scans = 0;
    const overview = () => ({ total: 2, analyzed: scans ? 2 : 1, pending: scans ? 0 : 1, failed: 0,
      unclassified: scans ? 0 : 1, regions: [
        { code: 'KR-11', name: '서울특별시', photos: media.filter(item => item.region_code === 'KR-11').length, videos: 0 },
        { code: 'KR-26', name: '부산광역시', photos: media.filter(item => item.region_code === 'KR-26').length, videos: 0 },
        { code: 'KR-49', name: '제주특별자치도', photos: media.filter(item => item.region_code === 'KR-49').length, videos: 0 },
      ] });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string, args: { ids?: number[]; regionCode?: string; district?: string; id?: number }) => {
        if (command === 'list_media') return media.map(item => ({ ...item }));
        if (command === 'list_albums') return [];
        if (command === 'location_overview') return overview();
        if (command === 'analyze_locations') {
          scans++;
          media[1].region_code = 'KR-49'; media[1].region_name = '제주특별자치도'; media[1].location_status = 'ready';
          return overview();
        }
        if (command === 'assign_media_region') {
          for (const item of media) if (args.ids?.includes(item.id)) {
            item.region_code = args.regionCode!;
            item.region_name = args.regionCode === 'KR-26' ? '부산광역시' : '서울특별시';
            item.district = args.district ?? '';
            item.location_source = 'manual'; item.location_status = 'ready';
          }
          return null;
        }
        if (command === 'media_thumbnail') return `C:/location-photo-${args.id}.jpg`;
        if (command === 'increment_media_view') return 1;
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('button', { name: '추억 지도', exact: true }).click();
  await expect(page.locator('.memoryMapRegion')).toHaveCount(16);
  await expect(page.locator('.memoryMapAnalysis')).toContainText('1 / 2');
  await expect(page.getByRole('button', { name: '위치 정보 분석하기', exact: true })).toBeInViewport();
  await page.screenshot({ path: `test-results/photo-location-map-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '위치 정보 분석하기', exact: true }).click();
  await expect(page.locator('.memoryMapAnalysis')).toContainText('2 / 2');
  await expect(page.getByRole('button', { name: '위치 정보 분석하기', exact: true })).toBeDisabled();
  await page.locator('.memoryMapPlaceList button').filter({ hasText: '제주' }).click();
  await expect(page.locator('.memoryMapGallery')).toContainText('1장의 사진');
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.locator('.galleryGrid .mediaTile[data-media-id="1"]').click();
  await page.locator('.galleryGrid .mediaTile[data-media-id="2"]').click();
  await page.locator('.galleryGrid .mediaTile[data-media-id="3"]').click();
  await page.getByRole('button', { name: '지역 일괄 수정', exact: true }).click();
  const editor = page.locator('#libraryBulkRegion');
  await expect(editor).toContainText('선택한 2개의 시·도');
  await page.screenshot({ path: `test-results/photo-location-bulk-${test.info().project.name}.png` });
  await editor.getByLabel('지정할 지역').selectOption('KR-26');
  await editor.getByLabel('시군구').selectOption('해운대구');
  await editor.getByRole('button', { name: '지역 저장' }).click();
  await expect(editor).toContainText('선택한 2개 기록');
  await page.getByRole('button', { name: '선택 끝내기', exact: true }).click();
  await page.locator('.galleryGrid .mediaTile[data-media-id="1"]').click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await expect(detail.getByLabel('위치', { exact: true })).toContainText('부산광역시 · 해운대구');
  await expect(detail.getByText('37.56650, 126.97800')).toBeVisible();
});
