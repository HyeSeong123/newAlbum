import { expect, test } from '@playwright/test';

test('fabric album colors survive create, edit and reload', async ({ page }) => {
  await page.route('**/album-color-*.jpg', (route) => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, file_path: `C:/album-color-${index}.jpg`, file_type: 'image', taken_at: '2026-09-01', width: 640, height: 480, duration: null, size_bytes: 42, rating: 0, comment: '', favorite: false, view_count: 0, metadata_status: 'ready' }));
    let albums = JSON.parse(localStorage.getItem('test-color-albums') || 'null') ?? [
      { id: 1, title: '브라운 앨범', description: '', cover_color: '#6A4538', created_at: '2026-09-01', items: media },
      { id: 2, title: '네이비 앨범', description: '', cover_color: '#2F4058', created_at: '2026-09-01', items: media.slice(0, 4) },
    ];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => `/${path.split('/').pop()}`,
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return albums;
        if (command === 'create_album_from_media') {
          albums.push({ id: 3, title: args.title, description: '', cover_color: args.coverColor, created_at: '2026-09-15', items: media.filter((item) => args.mediaIds.includes(item.id)) });
          localStorage.setItem('test-color-albums', JSON.stringify(albums));
          return 3;
        }
        if (command === 'update_album') {
          albums = albums.map((album: { id: number }) => album.id === args.id ? { ...album, title: args.title, cover_color: args.coverColor, items: media.filter((item) => args.mediaIds.includes(item.id)) } : album);
          localStorage.setItem('test-color-albums', JSON.stringify(albums));
        }
        return [];
      },
    } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.locator('.frontAlbum')).toHaveCount(2);
  await expect(page.locator('.frontAlbumDecoration, .frontAlbumPhoto')).toHaveCount(0);
  await expect(page.locator('.frontAlbumWindow')).toHaveCount(2);
  await expect(page.locator('.frontAlbum').first()).toHaveCSS('--album-color', '#6A4538');

  await page.getByRole('button', { name: '브라운 앨범 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumPaper')).toHaveCount(2);
  await expect(reader.locator('.binderRings')).toHaveCount(0);
  await expect(reader.locator('.albumPagePhoto')).toHaveCount(4);
  await expect(reader.locator('.albumBookBase')).toHaveAttribute('src', /album-open-white/);
  expect(await reader.locator('.albumHardback').evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(reader.locator('.scrapbookStage, .scrapbookSheet, .scrapbookPrint')).toHaveCount(0);
  const spread = await reader.locator('.albumSpread').boundingBox();
  const canvas = await reader.locator('.albumHardback').boundingBox();
  expect(Math.abs(canvas!.width / canvas!.height - 4 / 3)).toBeLessThan(.02);
  const navigation = await page.locator('.sidebar').boundingBox();
  const readerBox = await reader.boundingBox();
  expect(readerBox!.y).toBeCloseTo(navigation!.y + navigation!.height, 0);
  await expect(page.locator('.sidebar .brand')).toBeVisible();
  if (test.info().project.name === 'desktop') {
    expect(spread!.width).toBeGreaterThan(page.viewportSize()!.width * .88);
  }
  await reader.locator('.mediaImage').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  await reader.locator('.albumSpread').screenshot({ path: `test-results/album-inside-${test.info().project.name}.png` });
  await page.screenshot({ path: `test-results/album-header-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await expect(reader).toHaveCount(0);

  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await page.getByRole('tab', { name: '앨범보기' }).click();
  const libraryReader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(libraryReader.locator('.albumPaper')).toHaveCount(2);
  await expect(libraryReader.locator('.binderRings')).toHaveCount(0);
  await libraryReader.getByTitle('닫기').click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await page.getByRole('button', { name: /앨범 만들기/ }).click();
  const creator = page.getByRole('dialog', { name: '앨범 만들기', exact: true });
  await creator.getByLabel('제목', { exact: true }).fill('버건디 추억');
  await creator.getByRole('button', { name: '버건디 색상', exact: true }).click();
  await creator.screenshot({ path: `test-results/album-color-create-${test.info().project.name}.png` });
  await creator.getByRole('button', { name: '만들기', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  const created = page.getByRole('button', { name: '버건디 추억 앨범 열기' }).locator('.frontAlbum');
  await expect(created).toHaveCSS('--album-color', '#8A2E35');

  await page.getByRole('button', { name: '선택', exact: true }).click();
  await page.getByRole('button', { name: '버건디 추억 앨범 선택' }).click();
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정' });
  await editor.getByRole('button', { name: '세이지 색상', exact: true }).click();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.getByRole('button', { name: '버건디 추억 앨범 열기' }).locator('.frontAlbum')).toHaveCSS('--album-color', '#D8DDCB');
});
