import { expect, test, type Page } from '@playwright/test';

async function nativeLibrary(page: Page, options: { existing?: 'media' | 'album' | 'diary'; firstRun?: boolean; partialImport?: boolean; faceScan?: boolean } = {}) {
  await page.addInitScript((options) => {
    if (options.firstRun && !sessionStorage.getItem('recovery-initialized')) {
      localStorage.removeItem('geuruteogi.first-run-completed-v1');
      sessionStorage.setItem('recovery-initialized', 'true');
    }
    const records = [1, 2].map(id => ({ id, file_path: `C:/recovery-${id}.jpg`, file_type: 'image',
      taken_at: '2026-09-25', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '',
      favorite: false, metadata_status: 'ready', location_status: id === 1 ? 'no-gps' : 'failed' }));
    let media = options.partialImport || options.existing === 'album' || options.existing === 'diary' ? [] : records;
    let albums = options.existing === 'album' ? [{ id: 1, title: '기존 앨범', description: '',
      cover_color: '#ffffff', created_at: '2026-09-25', items: records }] : [];
    const diary = options.existing === 'diary' ? [{ id: 1, date: '2026-09-25', title: '기존 일기',
      body: '이전 기록', mood: '평온', weather: '맑음', album_id: null }] : [];
    let pets: { id: number; name: string; media_ids: number[]; cover_media_id: number | null }[] = [];
    const index = { people: [{ id: 1, name: '가족', cover_face_id: 1 }], faces: [1, 2].map(id => ({
      id, media_id: id, person_id: 1, thumbnail: '/favicon.svg', confirmed: true })), scanned: [1, 2] };
    if (options.faceScan) { index.people = []; index.faces = []; index.scanned = []; }
    const faceAttempts: number[] = [];
    const calls: { [command: string]: number } = {};
    const overview = () => ({ total: media.length, analyzed: media.filter(item => item.location_status !== 'queued').length,
      pending: media.filter(item => item.location_status === 'queued').length,
      failed: media.filter(item => item.location_status === 'failed').length, unclassified: media.length, regions: [] });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: any = {}) => {
        calls[command] = (calls[command] ?? 0) + 1;
        document.documentElement.dataset.recoveryCalls = JSON.stringify(calls);
        if (command === 'list_media' || command === 'list_albums' || command === 'list_diary') {
          if (options.firstRun) await new Promise(resolve => setTimeout(resolve, 300));
          return structuredClone(command === 'list_media' ? media : command === 'list_albums' ? albums : diary);
        }
        if (command === 'list_face_index') return structuredClone(index);
        if (command === 'save_face_scan') {
          faceAttempts.push(args.mediaId);
          document.documentElement.dataset.faceAttempts = JSON.stringify(faceAttempts);
          if (args.mediaId === 2 && faceAttempts.filter(id => id === 2).length === 1) throw new Error('face scan save failed');
          if (!index.people.length) index.people.push({ id: 1, name: '가족', cover_face_id: 1 });
          index.scanned.push(args.mediaId);
          index.faces.push({ id: args.mediaId, media_id: args.mediaId, person_id: 1, thumbnail: '/favicon.svg', confirmed: true });
          return;
        }
        if (command === 'list_pets') return structuredClone(pets);
        if (command === 'save_diary') {
          if (calls[command] === 1) {
            await new Promise(resolve => window.addEventListener('release-diary-save', resolve, { once: true }));
            throw new Error('diary save failed');
          }
          diary.push({ ...args.entry, id: 1 });
          return;
        }
        if (command === 'increment_media_view') return 1;
        if (command === 'plugin:dialog|open') return ['C:/recovery-1.jpg', 'C:/recovery-2.jpg'];
        if (command === 'register_paths') {
          media = calls[command] === 1 ? records.slice(0, 1) : records;
          if (calls[command] === 1) throw new Error('second file unreadable');
          return structuredClone(media);
        }
        if (command === 'location_overview') return overview();
        if (command === 'region_media_page') return { items: structuredClone(media), total: media.length, years: ['2026'] };
        if (command === 'queue_failed_locations') {
          const ids = media.filter(item => item.location_status === 'failed').map(item => item.id);
          document.documentElement.dataset.retriedLocationIds = JSON.stringify(ids);
          media = media.map(item => ids.includes(item.id) ? { ...item, location_status: 'queued' } : item);
          return overview();
        }
        if (command === 'analyze_locations') {
          if (calls[command] === 1) throw new Error('location read failed');
          media = media.map(item => item.location_status === 'queued' ? { ...item, location_status: 'no-gps' } : item);
          return overview();
        }
        if (command === 'rename_face_person' || command === 'set_person_cover_face' || command === 'save_pet'
          || command === 'create_album_from_media' || command === 'update_album') {
          if (calls[command] === 1) throw new Error('transient save failure');
          if (command === 'rename_face_person') index.people[0].name = args.name;
          if (command === 'set_person_cover_face') index.people[0].cover_face_id = args.faceId;
          if (command === 'save_pet') pets = [{ id: 1, name: args.name, media_ids: args.mediaIds, cover_media_id: args.coverMediaId }];
          if (command === 'create_album_from_media') albums = [{ id: 1, title: args.title, description: '',
            cover_color: args.coverColor, created_at: '2026-09-25', items: records.filter(item => args.mediaIds.includes(item.id)) }];
          if (command === 'update_album') albums = albums.map(album => ({ ...album, title: args.title, contents: args.contents }));
          document.documentElement.dataset.savedRecoveryArgs = JSON.stringify(args);
          return 1;
        }
        return [];
      },
    } });
  }, options);
}

for (const existing of ['media', 'album', 'diary'] as const) {
  test(`existing native ${existing} skips first-run guidance after asynchronous loading and reload`, async ({ page }) => {
    const guides: string[] = [];
    await nativeLibrary(page, { existing, firstRun: true });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.getElementById('firstRunTitle')) document.documentElement.dataset.guideAppeared = 'true';
      }).observe(document, { childList: true, subtree: true });
    });
    page.on('pageerror', error => guides.push(error.message));
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('geuruteogi.first-run-completed-v1'))).toBe('true');
    await expect(page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' })).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-guide-appeared', 'true');
    await page.reload();
    await expect(page.getByRole('heading', { name: '홈', exact: true })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-guide-appeared', 'true');
    expect(guides).toEqual([]);
  });
}

test('diary storage failure retains every field without creating a phantom or duplicate entry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '첫 일기 쓰기' }).click();
  const dialog = page.getByRole('dialog', { name: '새 일기' });
  await dialog.getByLabel('제목', { exact: true }).fill('잃으면 안 되는 제목');
  await dialog.getByRole('textbox', { name: '내용', exact: true }).fill('저장 실패에도 남아야 하는 내용');
  await dialog.getByLabel('날짜', { exact: true }).fill('2026-09-25');
  await dialog.getByLabel('오늘의 기분').selectOption('그리움');
  await dialog.getByRole('combobox', { name: '날씨', exact: true }).selectOption('비');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function() { throw new Error('quota'); };
    window.addEventListener('restore-storage', () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await dialog.getByRole('button', { name: '일기 저장' }).click();
  await expect(dialog.getByRole('alert')).toContainText('입력한 내용은 그대로 남아 있어요.');
  await expect(dialog.getByLabel('제목', { exact: true })).toHaveValue('잃으면 안 되는 제목');
  await expect(dialog.getByRole('textbox', { name: '내용', exact: true })).toHaveValue('저장 실패에도 남아야 하는 내용');
  await expect(dialog.getByLabel('날짜', { exact: true })).toHaveValue('2026-09-25');
  await expect(dialog.getByLabel('오늘의 기분')).toHaveValue('그리움');
  await expect(dialog.getByRole('combobox', { name: '날씨', exact: true })).toHaveValue('비');
  await expect(page.locator('.diaryCard')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')));
  await dialog.getByRole('button', { name: '일기 저장' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.diaryCard')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryCard')).toHaveCount(1);
  await expect(page.locator('.diaryCard')).toContainText('저장 실패에도 남아야 하는 내용');
});

test('invalid stored diary leaves the app usable and does not overwrite existing data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('warm-journal-diaries-v1', '{"preserve":"original"}'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('일기를 불러오지 못했습니다');
  await expect(page.getByRole('button', { name: '일기 쓰기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '첫 일기 쓰기' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('warm-journal-diaries-v1'))).toBe('{"preserve":"original"}');
  expect(errors).toEqual([]);
});

test('native diary blocks duplicate submits and retains the draft through a failed save', async ({ page }) => {
  await nativeLibrary(page);
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '첫 일기 쓰기' }).click();
  const dialog = page.getByRole('dialog', { name: '새 일기' });
  await dialog.getByLabel('제목', { exact: true }).fill('한 번만 저장');
  await dialog.getByRole('textbox', { name: '내용', exact: true }).fill('네이티브 저장 실패에도 보관');
  await dialog.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.recoveryCalls!).save_diary)).toBe(1);
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('release-diary-save')));
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('제목', { exact: true })).toHaveValue('한 번만 저장');
  await expect(dialog.getByRole('textbox', { name: '내용', exact: true })).toHaveValue('네이티브 저장 실패에도 보관');
  await dialog.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.diaryCard')).toHaveCount(1);
});

test('partial native import keeps successful photos and retry does not duplicate them', async ({ page }) => {
  await nativeLibrary(page, { partialImport: true });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 가져오기', exact: true }).click();
  await page.getByRole('dialog', { name: '사진·영상 가져오기' }).getByRole('button', { name: '파일 선택' }).click();
  await expect(page.getByRole('alert')).toContainText('1개 파일은 가져왔습니다.');
  await expect(page.getByRole('alert')).toContainText('등록된 사진은 그대로 남아 있습니다.');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  await page.getByRole('dialog', { name: '사진·영상 가져오기' }).getByRole('button', { name: '파일 선택' }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await expect(page.locator('.mediaTile[data-media-id="1"]')).toHaveCount(1);
  await expect(page.locator('.mediaTile[data-media-id="2"]')).toHaveCount(1);
});

test('GPS absence and analysis failure are distinct, retries only failed files, and preserves originals', async ({ page }) => {
  await nativeLibrary(page);
  await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('group', { name: '추억 보기' }).getByRole('button', { name: '추억 지도' }).click();
  await page.locator('.memoryMapPlaces').getByRole('button', { name: /지역 미분류/ }).click();
  const gallery = page.locator('.memoryMapGallery');
  await expect(gallery.locator('[data-location-status="no-gps"]')).toHaveText('GPS 정보 없음');
  await expect(gallery.locator('[data-location-status="failed"]')).toHaveText('위치 정보 읽기 실패');
  await gallery.getByRole('button', { name: 'recovery-1.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await expect(detail.locator('[data-location-status="no-gps"]')).toContainText('직접 지역을 지정');
  await detail.getByTitle('닫기', { exact: true }).click();
  await gallery.getByRole('button', { name: 'recovery-2.jpg 상세보기', exact: true }).click();
  await expect(detail.locator('[data-location-status="failed"]')).toContainText('원본 사진은 유지됩니다');
  await detail.getByTitle('닫기', { exact: true }).click();
  await page.locator('.memoryMapAutoButton').click();
  await expect(page.getByRole('alert')).toContainText('이미 등록된 사진과 확인한 지역은 그대로');
  await expect(page.locator('html')).toHaveAttribute('data-retried-location-ids', '[2]');
  await page.locator('.memoryMapAutoButton').click();
  await expect(page.locator('.memoryMapAutoButton')).toBeDisabled();
  await expect(gallery.locator('.recordMediaGrid > button')).toHaveCount(2);
  await expect(gallery.locator('[data-location-status="no-gps"]')).toHaveCount(2);
});

test('person management preserves a failed name draft and keeps cover selection open for retry', async ({ page }) => {
  await nativeLibrary(page);
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '가족 2장', exact: true }).click();
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  await page.getByRole('button', { name: '이름 수정', exact: true }).click();
  await page.getByLabel('인물 이름').fill('우리 가족');
  await page.getByRole('button', { name: '이름 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('인물 이름')).toHaveValue('우리 가족');
  await page.getByRole('button', { name: '이름 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리 가족', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  await page.getByRole('button', { name: '대표 사진 변경', exact: true }).click();
  await page.getByRole('button', { name: '대표 사진으로 설정', exact: true }).nth(1).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '대표 사진으로 설정', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '대표 사진으로 설정', exact: true }).nth(1).click();
  await expect(page.getByRole('button', { name: '대표 사진으로 설정', exact: true })).toHaveCount(0);
  await expect(page.locator('.personPhoto').nth(1).locator('.personCoverBadge')).toHaveText('대표');
});

test('person empty action reports a mixed face scan failure and retries only the failed original', async ({ page }) => {
  await nativeLibrary(page, { faceScan: true });
  // Exercise the UI/IPC queue on both viewports; real inference has its own desktop test.
  await page.route('**/src/features/people/faceService.ts*', async route => {
    if (route.request().url().includes('recovery-original')) return route.continue();
    await route.fulfill({ contentType: 'application/javascript', body: `
      export * from '/src/features/people/faceService.ts?recovery-original';
      export async function loadFaceEngine() {}
      export async function scanPhoto(item) {
        await window.__TAURI_INTERNALS__.invoke('save_face_scan', { mediaId: Number(item.id), faces: [] });
      }
    ` });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.locator('.emptyState').getByRole('button', { name: '사진에서 사람 찾기', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2장 중 1장을 확인했습니다. 1장은 확인하지 못했습니다.');
  await expect(page.getByRole('button', { name: '가족 1장', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 사진에서 사람 찾기', exact: true }).click();
  await expect(page.getByRole('button', { name: '가족 2장', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-face-attempts', '[1,2,2]');
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(2);
});

test('pet empty action and management preserve name, photos and cover on failed save', async ({ page }) => {
  await nativeLibrary(page);
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '반려동물 등록하기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '반려동물 등록', exact: true });
  await dialog.getByLabel('이름', { exact: true }).fill('보리');
  await dialog.getByRole('button', { name: '사진 선택', exact: true }).nth(0).click();
  await dialog.getByRole('button', { name: '사진 선택', exact: true }).nth(1).click();
  await dialog.getByLabel('대표 사진', { exact: true }).selectOption('2');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('이름', { exact: true })).toHaveValue('보리');
  await expect(dialog.getByLabel('대표 사진', { exact: true })).toHaveValue('2');
  await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(2);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '반려동물 관리', exact: true }).click();
  await expect(page.getByRole('button', { name: '비슷한 사진 찾기', exact: true })).toBeVisible();
});

test('album creation and editing preserve title and written content after failed saves', async ({ page }) => {
  await nativeLibrary(page);
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.getByRole('button', { name: '현재 결과 전체 선택 (2개)', exact: true }).click();
  await page.getByRole('button', { name: '앨범 만들기', exact: true }).click();
  const creation = page.getByRole('dialog', { name: '앨범 만들기' });
  await creation.getByLabel('제목', { exact: true }).fill('우리 앨범');
  await creation.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(creation.getByRole('alert')).toBeVisible();
  await expect(creation.getByLabel('제목', { exact: true })).toHaveValue('우리 앨범');
  await creation.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(creation).toBeHidden();
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정' });
  await editor.getByRole('button', { name: '편지+', exact: true }).click();
  await editor.getByLabel('감상문 제목', { exact: true }).fill('다시 기억할 하루');
  await editor.getByLabel('감상문 내용', { exact: true }).fill('저장 실패에도 남아 있는 글');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.getByLabel('감상문 제목', { exact: true })).toHaveValue('다시 기억할 하루');
  await expect(editor.getByLabel('감상문 내용', { exact: true })).toHaveValue('저장 실패에도 남아 있는 글');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.savedRecoveryArgs!).contents.some(
    (entry: { body: string }) => entry.body === '저장 실패에도 남아 있는 글'))).toBe(true);
});

test('empty memory and map actions return to photo records', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('button', { name: '사진 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '사진 기록', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('group', { name: '추억 보기' }).getByRole('button', { name: '추억 지도' }).click();
  await page.getByRole('button', { name: '사진 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '사진 기록', exact: true })).toBeVisible();
});

test('search date labels and action buttons remain readable at narrow and wide widths', async ({ page, isMobile }) => {
  for (const width of isMobile ? [360, 393] : [1100, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
    const panel = page.locator('.librarySearchPanel');
    for (const large of [false, true]) {
      const toggle = page.locator('.layoutToggle');
      if ((await toggle.getAttribute('aria-pressed') === 'true') !== large) await toggle.click();
      await expect(panel).toBeVisible();
      const labels = await panel.locator('.takenDateControls label > span').evaluateAll(elements => elements.map(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].map(rect => rect.y);
      }));
      expect(labels).toHaveLength(2);
      for (const lines of labels) expect(new Set(lines).size).toBe(1);
      const datesFit = await panel.locator('input[type="date"]').evaluateAll(inputs => inputs.every(input => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontSize} ${style.fontFamily}`;
        const textWidth = context.measureText('yyyy-mm-dd').width;
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return input.clientWidth >= textWidth + padding + 24;
      }));
      expect(datesFit).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const button of await panel.getByRole('button').all()) {
        expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
      await panel.screenshot({ path: `test-results/search-controls-${width}${large ? '-large' : ''}.png` });
    }
  }
});
