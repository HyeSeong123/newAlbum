import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function openImport(page: Page) {
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  return page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
}

for (const kind of ['files', 'folder'] as const) {
  test(`native ${kind} import creates an album with only new media and the chosen color`, async ({ page }) => {
    await page.addInitScript(() => {
      const media = [1, 2].map(id => ({ id, file_path: `C:/import-${id}.jpg`, file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      let registered = media.slice(0, 1);
      let albums: unknown[] = [];
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        convertFileSrc: () => '/favicon.svg',
        invoke: async (command: string, args: any) => {
          if (command === 'list_media') return registered;
          if (command === 'list_albums') return albums;
          if (command === 'plugin:dialog|open') {
            document.documentElement.dataset.importOptions = JSON.stringify(args.options);
            return args.options.directory ? 'C:/memories' : ['C:/import-2.jpg'];
          }
          if (command === 'register_paths') { registered = media; return registered; }
          if (command === 'assign_media_region') {
            document.documentElement.dataset.assignedImportRegion = JSON.stringify(args);
            registered = registered.map(item => args.ids.includes(item.id) ? { ...item, region_code:args.regionCode, district:args.district, location_source:'manual', location_status:'ready' } : item);
          }
          if (command === 'create_album_from_media') {
            document.documentElement.dataset.createdAlbum = JSON.stringify(args);
            albums = [{ id: 1, title: args.title, cover_color: args.coverColor, description: '', created_at: '2026-09-25', items: media.filter(item => args.mediaIds.includes(item.id)) }];
            return 1;
          }
          return [];
        },
      } });
    });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    await expect(page.locator('.mediaTile')).toHaveCount(1);
    await expect(page.locator('.importActions')).not.toContainText('폴더 가져오기');
    const dialog = await openImport(page);
    await dialog.getByRole('radio', { name: kind === 'folder' ? /폴더 가져오기/ : /사진·영상 가져오기/ }).check();
    if (kind === 'folder') {
      await expect(dialog.getByLabel('가져올 폴더의 시군구')).toBeDisabled();
      await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 폴더의 시군구').selectOption('강남구');
      await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-41');
      await expect(dialog.getByLabel('가져올 폴더의 시군구')).toHaveValue('');
      await expect(dialog.getByLabel('가져올 폴더의 시군구').locator('option[value="강남구"]')).toHaveCount(0);
      await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 폴더의 시군구').selectOption('강남구');
    } else {
      await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
      await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 폴더의 시군구').selectOption('강남구');
      await dialog.getByRole('radio', { name:/사진·영상 가져오기/ }).check();
      await expect(dialog.getByLabel('가져올 폴더의 시도')).toHaveCount(0);
    }
    await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
    await expect(dialog.getByRole('button', { name: kind === 'folder' ? '폴더 선택' : '파일 선택' })).toBeDisabled();
    await dialog.getByLabel('앨범 제목', { exact: true }).fill('  가을 산책  ');
    await dialog.getByRole('button', { name: '네이비 색상' }).click();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: kind === 'folder' ? '폴더 선택' : '파일 선택' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.savedAlbumCard')).toHaveCount(1);
    await expect(page.locator('.savedAlbumTitle')).toHaveText('가을 산책');
    expect(await page.locator('html').getAttribute('data-created-album')).toBe(JSON.stringify({ title: '가을 산책', mediaIds: [2], coverColor: '#2F4058' }));
    const options = JSON.parse((await page.locator('html').getAttribute('data-import-options'))!);
    expect(options.directory).toBe(kind === 'folder');
    expect(options.multiple).toBe(kind === 'files');
    if (kind === 'folder') {
      expect(JSON.parse((await page.locator('html').getAttribute('data-assigned-import-region'))!)).toEqual({ ids:[2], regionCode:'KR-11', district:'강남구', country:'', city:'' });
      await page.getByRole('button', { name:'가을 산책 앨범 열기', exact:true }).click();
      await page.locator('.albumPagePhoto').first().click();
      await expect(page.getByRole('dialog', { name:'사진 상세' }).locator('.regionEditor')).toContainText('서울특별시 · 강남구');
    } else { await expect(page.locator('html')).not.toHaveAttribute('data-assigned-import-region'); }
  });
}

test('canceling the native picker leaves no empty album or stale album settings', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [{ id: 1, file_path: 'C:/cancel.jpg', file_type: 'image', taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
    let attempts = 0;
    let registered: unknown[] = [];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg', invoke: async (command: string) => {
        if (command === 'list_media') return registered;
        if (command === 'plugin:dialog|open') return ++attempts === 1 ? null : ['C:/cancel.jpg'];
        if (command === 'register_paths') { registered = media; return registered; }
        if (command === 'create_album_from_media') document.documentElement.dataset.unwantedAlbum = 'true';
        if (command === 'assign_media_region') document.documentElement.dataset.unwantedRegion = 'true';
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  let dialog = await openImport(page);
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-11');
  await dialog.getByLabel('가져올 폴더의 시군구').selectOption('강남구');
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('취소할 앨범');
  await dialog.getByRole('button', { name: '폴더 선택' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.mediaTile')).toHaveCount(0);
  dialog = await openImport(page);
  await expect(dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ })).not.toBeChecked();
  await expect(dialog.getByLabel('앨범 제목')).toHaveCount(0);
  await dialog.getByRole('button', { name: '파일 선택' }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await expect(page.locator('html')).not.toHaveAttribute('data-unwanted-album');
  await expect(page.locator('html')).not.toHaveAttribute('data-unwanted-region');
});

test('browser file imports honor the album toggle and chosen color', async ({ page }) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  let dialog = await openImport(page);
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('첫 기록');
  await dialog.getByRole('button', { name: '버건디 색상' }).click();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: '파일 선택' }).click();
  await (await chooser).setFiles('tests/fixtures/pet-dog.jpg');
  await expect(page.locator('.savedAlbumTitle')).toHaveText('첫 기록');
  await expect(page.locator('.savedAlbumOpen .frontAlbum')).toHaveCSS('--album-color', '#8A2E35');
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  dialog = await openImport(page);
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('사용하지 않는 이름');
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).uncheck();
  const nextChooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: '파일 선택' }).click();
  await (await nextChooser).setFiles('node_modules/@vladmandic/face-api/demo/sample1.jpg');
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(page.locator('.savedAlbumCard')).toHaveCount(1);
});

test('browser folder imports create an album and ignore unsupported files', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'album-import-'));
  try {
    await copyFile('tests/fixtures/pet-dog.jpg', join(directory, 'walk.jpg'));
    await copyFile('package.json', join(directory, 'notes.json'));
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    const dialog = await openImport(page);
    await dialog.getByRole('radio', { name: /폴더 가져오기/ }).check();
    await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-49');
    await dialog.getByLabel('가져올 폴더의 시군구').selectOption('서귀포시');
    await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
    await dialog.getByLabel('앨범 제목').fill('폴더의 기억');
    await dialog.getByRole('button', { name: '브라운 색상' }).click();
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: '폴더 선택' }).click();
    await (await chooser).setFiles(directory);
    await expect(page.locator('.savedAlbumTitle')).toHaveText('폴더의 기억');
    await expect(page.locator('.savedAlbumMeta')).toContainText('사진 1장');
    await expect(page.locator('.savedAlbumOpen .frontAlbum')).toHaveCSS('--album-color', '#6A4538');
    await page.getByRole('button', { name:'사진 기록', exact:true }).click();
    await page.locator('.mediaTile').first().click();
    const detail = page.getByRole('dialog', { name:'사진 상세' });
    await expect(detail.locator('.regionEditor')).toContainText('제주특별자치도 · 서귀포시');
    await expect(detail.locator('.regionEditor')).toContainText('직접 지정');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
for (const failRegion of [false, true]) {
  test(`folder location ${failRegion ? 'failure keeps imported records' : 'applies only to new photos and videos'}`, async ({ page }) => {
    await page.addInitScript(({ failRegion }) => {
      const media = [1,2,3,4].map(id => ({ id, file_path:`C:/place-${id}.${id === 4 ? 'wav' : id === 3 ? 'mp4' : 'jpg'}`, file_type:id === 4 ? 'audio' : id === 3 ? 'video' : 'image', taken_at:'2026-09-25', width:640, height:480, size_bytes:1000, rating:0, comment:'', favorite:false, metadata_status:'ready' }));
      let registered = media.slice(0,1);
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        convertFileSrc: () => '/favicon.svg',
        invoke: async (command: string, args: any) => {
          if (command === 'list_media') return registered;
          if (command === 'plugin:dialog|open') return 'C:/place';
          if (command === 'register_paths') { registered = media; return registered; }
          if (command === 'assign_media_region') {
            document.documentElement.dataset.assignedImportRegion = JSON.stringify(args);
            if (failRegion) throw new Error('location write unavailable');
          }
          return [];
        },
      } });
    }, { failRegion });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    await expect(page.locator('.mediaTile')).toHaveCount(1);
    const dialog = await openImport(page);
    await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
    await dialog.getByLabel('가져올 폴더의 시도').selectOption('KR-50');
    await expect(dialog.getByLabel('가져올 폴더의 시군구')).toBeDisabled();
    await dialog.getByRole('button', { name:'폴더 선택' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name:'기록 1개 더보기', exact:true }).click();
    await expect(page.locator('.mediaTile')).toHaveCount(4);
    expect(JSON.parse((await page.locator('html').getAttribute('data-assigned-import-region'))!)).toEqual({ ids:[2,3], regionCode:'KR-50', district:'', country:'', city:'' });
    if (failRegion) await expect(page.getByRole('alert')).toContainText('촬영 지역을 저장하지 못했습니다');
    else {
      await page.locator('.mediaTile[data-media-id="2"]').click();
      await expect(page.getByRole('dialog', { name:'사진 상세' }).locator('.regionEditor')).toContainText('세종특별자치시');
    }
  });
}
