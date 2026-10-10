import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function openImport(page: Page) {
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  return page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
}

test('large native import shows full-screen byte progress through region and album writes', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (message: unknown) => void>();
    let nextCallback = 0;
    const media = [{ id:1, file_path:'C:/big-memory.mp4', file_type:'video', taken_at:'2026-09-25', size_bytes:1024 ** 3, rating:0, comment:'', favorite:false, metadata_status:'ready' }];
    let registered: unknown[] = [];
    let albums: unknown[] = [];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      transformCallback: (callback: (message: unknown) => void) => { const id = ++nextCallback; callbacks.set(id, callback); return id; },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: any) => {
        if (command === 'list_media') return registered;
        if (command === 'list_albums') return albums;
        if (command === 'plugin:dialog|open' || command === 'choose_android_directory' || command === 'choose_android_gallery') return 'C:/memories';
        if (command === 'register_paths') {
          const callback = callbacks.get(args.progress.id)!;
          callback({ index:0, message:{ phase:'registering', processed:0, total:1, fileName:'big-memory.mp4', bytesProcessed:0, totalBytes:1024 ** 3 } });
          (window as any).advanceImport = () => callback({ index:1, message:{ phase:'registering', processed:0, total:1, fileName:'big-memory.mp4', bytesProcessed:512 * 1024 ** 2, totalBytes:1024 ** 3 } });
          await new Promise<void>(resolve => { (window as any).finishImport = resolve; });
          registered = media;
          callback({ index:2, end:true });
          return registered;
        }
        if (command === 'assign_media_region') await new Promise<void>(resolve => { (window as any).finishRegion = resolve; });
        if (command === 'create_album_from_media') {
          await new Promise<void>(resolve => { (window as any).finishAlbum = resolve; });
          albums = [{ id:1, title:args.title, cover_color:args.coverColor, description:'', created_at:'2026-09-25', items:media }];
          return 1;
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  const dialog = await openImport(page);
  await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
  await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-50');
  await dialog.getByRole('checkbox', { name:/가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('큰 영상의 추억');
  await dialog.getByRole('button', { name:'폴더 선택' }).click();
  const loading = page.getByRole('dialog', { name:'사진·영상 가져오는 중' });
  await expect(loading).toBeVisible();
  await expect(loading).toContainText('big-memory.mp4');
  await expect(loading.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(await page.locator('main.app').evaluate(element => (element as HTMLElement).inert)).toBe(true);
  const bounds = await page.locator('.mediaImportScreen').boundingBox();
  expect(bounds).toMatchObject({ x:0, y:0, width:page.viewportSize()!.width, height:page.viewportSize()!.height });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(loading).toBeFocused();
  await page.evaluate(() => (window as any).advanceImport());
  await expect(loading.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(loading).toContainText('읽은 용량 512.0 MB / 1.00 GB');
  await page.screenshot({ path:`test-results/media-import-loading-${test.info().project.name}.png` });
  await page.evaluate(() => (window as any).finishImport());
  await expect(loading).toContainText('촬영 지역을 저장하고 있어요');
  await expect(loading.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  await page.evaluate(() => (window as any).finishRegion());
  await expect(loading).toContainText('앨범에 추억을 담고 있어요');
  await page.evaluate(() => (window as any).finishAlbum());
  await expect(loading).toBeHidden();
  expect(await page.locator('main.app').evaluate(element => (element as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.savedAlbumTitle')).toHaveText('큰 영상의 추억');
});

test('browser input clearing keeps all selected photos and videos during asynchronous import', async ({ page }) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name:'사진 기록', exact:true }).click();
  await page.locator('input[type="file"][accept]').first().setInputFiles([
    { name:'photo.jpg', mimeType:'image/jpeg', buffer:Buffer.from('preview photo') },
    { name:'movie.mp4', mimeType:'video/mp4', buffer:Buffer.from('preview video') },
    { name:'notes.txt', mimeType:'text/plain', buffer:Buffer.from('unsupported') },
  ]);
  await expect(page.getByRole('dialog', { name:'사진·영상 가져오는 중' })).toBeHidden();
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await expect(page.getByRole('button', { name:'photo.jpg 상세보기' })).toBeVisible();
  await expect(page.getByRole('button', { name:'movie.mp4 상세보기' })).toBeVisible();
});

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
            document.documentElement.dataset.importPicker = command;
            document.documentElement.dataset.importOptions = JSON.stringify(args.options);
            return args.options.directory ? 'C:/memories' : ['C:/import-2.jpg'];
          }
          if (command === 'choose_android_gallery') {
            document.documentElement.dataset.importPicker = command;
            return ['content://media/external/images/media/2'];
          }
          if (command === 'choose_android_directory') {
            document.documentElement.dataset.importPicker = command;
            return 'C:/memories';
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
      await expect(dialog.getByLabel('가져올 기록의 시군구')).toBeDisabled();
      await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 기록의 시군구').selectOption('강남구');
      await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-41');
      await expect(dialog.getByLabel('가져올 기록의 시군구')).toHaveValue('');
      await expect(dialog.getByLabel('가져올 기록의 시군구').locator('option[value="강남구"]')).toHaveCount(0);
      await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 기록의 시군구').selectOption('강남구');
    } else {
      await dialog.getByRole('radio', { name:/폴더 가져오기/ }).check();
      await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-11');
      await dialog.getByLabel('가져올 기록의 시군구').selectOption('강남구');
      await dialog.getByRole('radio', { name:/사진·영상 가져오기/ }).check();
      await expect(dialog.getByLabel('가져올 기록의 시도')).toHaveValue('KR-11');
    }
    const android = await page.evaluate(() => /Android/i.test(navigator.userAgent));
    const pickerLabel = kind === 'folder' ? '폴더 선택' : android ? '갤러리 열기' : '파일 선택';
    await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
    await expect(dialog.getByRole('button', { name: pickerLabel })).toBeDisabled();
    await dialog.getByLabel('앨범 제목', { exact: true }).fill('  가을 산책  ');
    await dialog.getByRole('button', { name: '네이비 색상' }).click();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: pickerLabel }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.savedAlbumCard')).toHaveCount(1);
    await expect(page.locator('.savedAlbumTitle')).toHaveText('가을 산책');
    expect(await page.locator('html').getAttribute('data-created-album')).toBe(JSON.stringify({ title: '가을 산책', mediaIds: [2], coverColor: '#2F4058' }));
    if (android) {
      await expect(page.locator('html')).toHaveAttribute('data-import-picker', kind === 'folder' ? 'choose_android_directory' : 'choose_android_gallery');
      await expect(page.locator('html')).not.toHaveAttribute('data-import-options');
    } else {
      await expect(page.locator('html')).toHaveAttribute('data-import-picker', 'plugin:dialog|open');
      const options = JSON.parse((await page.locator('html').getAttribute('data-import-options'))!);
      expect(options.directory).toBe(kind === 'folder');
      expect(options.multiple).toBe(kind === 'files');
    }
    {
      expect(JSON.parse((await page.locator('html').getAttribute('data-assigned-import-region'))!)).toEqual({ ids:[2], regionCode:'KR-11', district:'강남구', country:'', city:'' });
      await page.getByRole('button', { name:'가을 산책 앨범 열기', exact:true }).click();
      await page.locator('.albumPagePhoto').first().click();
      await expect(page.getByRole('dialog', { name:'사진 상세' }).locator('.regionEditor')).toContainText('서울특별시 · 강남구');
    }
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
        if (command === 'plugin:dialog|open' || command === 'choose_android_directory' || command === 'choose_android_gallery') return ++attempts === 1 ? null : ['C:/cancel.jpg'];
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
  await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-11');
  await dialog.getByLabel('가져올 기록의 시군구').selectOption('강남구');
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('취소할 앨범');
  await dialog.getByRole('button', { name: '폴더 선택' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.mediaTile')).toHaveCount(0);
  dialog = await openImport(page);
  await expect(dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ })).not.toBeChecked();
  await expect(dialog.getByLabel('앨범 제목')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^(파일 선택|갤러리 열기)$/ }).click();
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
  await dialog.getByRole('button', { name: /^(파일 선택|갤러리 열기)$/ }).click();
  await (await chooser).setFiles('tests/fixtures/pet-dog.jpg');
  await expect(page.locator('.savedAlbumTitle')).toHaveText('첫 기록');
  await expect(page.locator('.savedAlbumOpen .frontAlbum')).toHaveCSS('--album-color', '#8A2E35');
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  dialog = await openImport(page);
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await dialog.getByLabel('앨범 제목').fill('사용하지 않는 이름');
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).uncheck();
  const nextChooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: /^(파일 선택|갤러리 열기)$/ }).click();
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
    await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-49');
    await dialog.getByLabel('가져올 기록의 시군구').selectOption('서귀포시');
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
          if (command === 'plugin:dialog|open' || command === 'choose_android_directory' || command === 'choose_android_gallery') return 'C:/place';
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
    await dialog.getByLabel('가져올 기록의 시도').selectOption('KR-50');
    await expect(dialog.getByLabel('가져올 기록의 시군구')).toBeDisabled();
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
