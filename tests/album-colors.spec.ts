import { expect, test, type Locator, type Page } from '@playwright/test';

const colors = ['#8A2E35', '#E5E1D5', '#414143', '#D8DDCB', '#6A4538', '#2F4058', '#000000', '#FFFFFF'];

test.beforeEach(async ({ page }) => {
  await page.route('**/appearance-photo.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript((palette) => {
    const media = [{ id: 1, file_path: 'C:/appearance-photo.jpg', file_type: 'image', taken_at: '2026-09-01', width: 640, height: 480, size_bytes: 42, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
    let albums = JSON.parse(localStorage.getItem('appearance-albums') || 'null') ?? palette.map((color, index) => ({ id: index + 1, title: `색상 앨범 ${index + 1}`, description: '', cover_color: color, created_at: '2026-09-01', items: media }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/appearance-photo.jpg',
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return albums;
        if (command === 'update_album') {
          albums = albums.map((album: { id: number }) => album.id === args.id ? { ...album, title: args.title, cover_color: args.coverColor } : album);
          localStorage.setItem('appearance-albums', JSON.stringify(albums));
        }
        return [];
      },
    } });
  }, colors);
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
});

async function expectInsideViewport(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  await expect.poll(async () => {
    const box = await element.boundingBox();
    const viewport = page.viewportSize()!;
    return box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
  }).toBe(true);
  const box = (await element.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test('preset and custom cover colors retain a distinct binding beside the photo', async ({ page }) => {
  await expect(page.locator('.savedAlbumCard')).toHaveCount(colors.length);
  for (const [index, color] of colors.entries()) {
    const cover = page.locator('.savedAlbumOpen .frontAlbum').nth(index);
    await expect(cover).toHaveCSS('--album-color', color);
    const spine = cover.locator('.frontAlbumSpine');
    await expect(spine).toBeVisible();
    const spineBox = (await spine.boundingBox())!;
    const coverBox = (await cover.boundingBox())!;
    const photoBox = (await cover.locator('.frontAlbumWindow').boundingBox())!;
    expect(spineBox.width).toBeGreaterThan(coverBox.width * .03);
    expect(spineBox.x + spineBox.width).toBeLessThan(photoBox.x);
    expect(spineBox.height).toBeGreaterThan(coverBox.height * .98);
  }
  await page.locator('.frontAlbumBase').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
  await page.screenshot({ path: `test-results/album-appearance-covers-${test.info().project.name}.png`, fullPage: true });
});

test('bottom album menu stays visible after resize and remains usable with keyboard and pointer', async ({ page }) => {
  const trigger = page.locator('.savedAlbumFooter .actionMenuTrigger').last();
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await trigger.click();
  const menu = page.getByRole('group', { name: '색상 앨범 8 앨범 메뉴' });
  await expectInsideViewport(page, menu);
  const anchor = (await trigger.boundingBox())!;
  const panel = (await menu.boundingBox())!;
  expect(panel.y + panel.height).toBeLessThanOrEqual(anchor.y);
  for (const button of await menu.getByRole('button').all()) await expectInsideViewport(page, button);
  await expect(menu.getByRole('button', { name: '앨범 수정', exact: true })).toBeFocused();
  await page.screenshot({ path: `test-results/album-appearance-menu-${test.info().project.name}.png` });
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 260 });
  await expectInsideViewport(page, menu);
  for (const button of await menu.getByRole('button').all()) await expectInsideViewport(page, button);
  await page.setViewportSize(original);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole('button', { name: '앨범 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정', exact: true });
  await expect(editor).toBeVisible();
  await expect(menu).toBeHidden();
  await editor.getByTitle('닫기').click();
  await trigger.click();
  await page.locator('.savedAlbumsIntro').click();
  await expect(menu).toBeHidden();
});

test('album trim follows saved color while paper stays white after edits and reload', async ({ page }) => {
  await page.getByRole('button', { name: '색상 앨범 6 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  const mobile = page.viewportSize()!.width <= 520;
  const trim = mobile ? reader.locator('.albumPaper').first() : reader.locator('.albumBookTrim');
  await expect(trim).toHaveCSS('border-top-color', 'rgb(47, 64, 88)');
  if (mobile) await expect(reader.locator('.albumPaper').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await reader.getByRole('button', { name: '앨범 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정', exact: true });
  await editor.getByRole('button', { name: '앨범 정보', exact: true }).click();
  await editor.getByRole('button', { name: '버건디 색상', exact: true }).click();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(trim).toHaveCSS('border-top-color', 'rgb(138, 46, 53)');
  if (mobile) await expect(reader.locator('.albumPaper').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await reader.locator('.albumBookBase').evaluate((image: HTMLImageElement) => image.decode());
  await reader.locator('.albumSpread').screenshot({ path: `test-results/album-appearance-pages-${test.info().project.name}.png` });
  await page.reload();
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '색상 앨범 6 앨범 열기', exact: true }).click();
  await expect(trim).toHaveCSS('border-top-color', 'rgb(138, 46, 53)');
  await expect(reader.locator('.albumPagePhoto .mediaImage')).toHaveCSS('object-fit', 'contain');
});
