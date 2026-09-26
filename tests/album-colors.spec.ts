import { expect, test } from '@playwright/test';

test('fabric album colors survive create, edit and reload', async ({ page }) => {
  await page.route('**/album-color-*.jpg', (route) => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    Math.random = () => 1234 / 0x100000000;
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
  await expect(page.locator('.savedAlbumGrid .frontAlbumTone')).toHaveCount(0);
  const coverBox = await page.locator('.frontAlbum').first().boundingBox();
  expect(coverBox!.height / coverBox!.width).toBeCloseTo(1.25, 2);
  await expect(page.locator('.frontAlbumBase').first()).toHaveAttribute('src', /album-front-flat/);
  await expect(page.locator('.frontAlbumWindow').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.frontAlbumTitle').first()).toHaveCSS('transform', 'none');
  await page.locator('.frontAlbumBase').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  await page.screenshot({ path: `test-results/flat-album-covers-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '브라운 앨범 앨범 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '앨범 수정', exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: '앨범 수정', exact: true }).getByTitle('닫기').click();

  await page.getByRole('button', { name: '브라운 앨범 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumPhotoList')).toHaveCount(0);
  await expect(reader.locator('.albumPaper')).toHaveCount(2);
  await expect(reader.locator('.binderRings')).toHaveCount(0);
  await expect(reader.locator('.albumPagePhoto')).toHaveCount(4);
  await expect(reader.locator('.albumBookBase')).toHaveAttribute('src', /album-open-white-thin/);
  await reader.locator('.albumBookBase').evaluate((image: HTMLImageElement) => image.decode());
  expect(await reader.locator('.albumHardback').evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none');
  await expect(reader.locator('.scrapbookStage, .scrapbookSheet, .scrapbookPrint')).toHaveCount(0);
  const spread = await reader.locator('.albumSpread').boundingBox();
  expect(spread!.width / spread!.height).toBeCloseTo(2.2, 2);
  const navigation = await page.locator('.sidebar').boundingBox();
  const readerBox = await reader.boundingBox();
  expect(readerBox!.y).toBeCloseTo(navigation!.y + navigation!.height, 0);
  await expect(page.locator('.sidebar .brand')).toBeVisible();
  if (test.info().project.name === 'desktop') {
    expect(spread!.width).toBeGreaterThan(page.viewportSize()!.width * .88);
  }
  await reader.locator('.mediaImage').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((image) => image.decode())));
  for (const photo of await reader.locator('.albumPagePhoto').all()) {
    const bounds = (await photo.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(10);
    expect(bounds.height).toBeGreaterThan(10);
    await expect(photo.locator('.mediaImage')).toHaveCSS('object-fit', 'contain');
    await expect(photo.locator('.mediaImage')).toHaveCSS('object-position', '50% 50%');
  }
  await reader.locator('.albumSpread').screenshot({ path: `test-results/album-inside-${test.info().project.name}.png` });
  await page.screenshot({ path: `test-results/album-header-${test.info().project.name}.png` });
  const viewport = page.viewportSize()!;
  const sizes = test.info().project.name === 'desktop'
    ? [viewport, { width: 2560, height: 900 }, { width: 1080, height: 720 }]
    : [viewport];
  for (const size of sizes) {
    await page.setViewportSize(size);
    const book = (await reader.locator('.albumBookStage').boundingBox())!;
    const base = (await reader.locator('.albumBookBase').boundingBox())!;
    const prev = (await reader.getByTitle('이전 책장', { exact: true }).boundingBox())!;
    const next = (await reader.getByTitle('다음 책장', { exact: true }).boundingBox())!;
    const header = (await reader.locator('.albumJournalHeader').boundingBox())!;
    const pager = (await reader.locator('.albumJournalPager').boundingBox())!;
    expect(book.width / book.height).toBeCloseTo(2.2, 2);
    expect(book.x - prev.x - prev.width).toBeCloseTo(6, 0);
    expect(next.x - book.x - book.width).toBeCloseTo(6, 0);
    expect(prev.y + prev.height / 2).toBeCloseTo(book.y + book.height / 2, 0);
    expect(next.y + next.height / 2).toBeCloseTo(book.y + book.height / 2, 0);
    expect(base.x + base.width * .027).toBeCloseTo(book.x, 0);
    expect(base.x + base.width * .973).toBeCloseTo(book.x + book.width, 0);
    expect(prev.x).toBeGreaterThanOrEqual(0);
    expect(next.x + next.width).toBeLessThanOrEqual(size.width);
    expect(book.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(book.y + book.height).toBeLessThanOrEqual(pager.y);
    if (size.width === 2560) {
      expect(prev.x).toBeGreaterThan(200);
      expect(next.x + next.width).toBeLessThan(size.width - 200);
      await page.screenshot({ path: 'test-results/album-book-edge-arrows-ultrawide.png' });
    }
  }
  await page.setViewportSize(viewport);
  const pageCount = await reader.getByLabel('앨범 책장 이동').getAttribute('max');
  await reader.getByTitle('다음 책장', { exact: true }).click();
  await expect(reader.locator('.albumPagerActions p')).toHaveText(`2 / ${pageCount} 펼침`);
  await expect(reader.getByTitle('이전 책장', { exact: true })).toBeEnabled();
  await reader.getByTitle('이전 책장', { exact: true }).click();
  await expect(reader.locator('.albumPagerActions p')).toHaveText(`1 / ${pageCount} 펼침`);
  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await expect(reader).toHaveCount(0);

  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await page.getByRole('tab', { name: '전체 앨범' }).click();
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
  await expect(created.locator('.frontAlbumTone')).toHaveCount(0);

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

