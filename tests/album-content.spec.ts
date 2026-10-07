import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    console.log('Album failure DOM:', await page.locator('.albumEditor').innerHTML().catch(() => 'No editor'));
    console.log('Saved album:', await page.evaluate(() => localStorage.getItem('album-content-test')));
  }
});

test.beforeEach(async ({ page }) => {
  await page.route('**/chapter-photo-*.jpg', route => route.fulfill({ contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#9fae90"/></svg>' }));
  await page.addInitScript(() => {
    const media = Array.from({ length: 6 }, (_, i) => ({ id:i + 1, file_path:`C:/chapter-photo-${i + 1}.jpg`, file_type:'image',
      taken_at:'2026-05-15', width:900, height:600, size_bytes:10, title:`사진 ${i + 1}`, rating:0, comment:'기존 기록', favorite:false }));
    const read = () => JSON.parse(localStorage.getItem('album-content-test') || 'null') || { id:1, title:'제주 여행', description:'', cover_color:'#D8DDCB', created_at:'2026-05-15', items:media };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => '/' + path.split('/').pop(),
      invoke: async (command: string, args: Record<string, any>) => {
        if (command === 'list_media') return structuredClone(media);
        if (command === 'list_albums') return [read()];
        if (command === 'update_album') {
          const next = { ...read(), title:args.title, cover_color:args.coverColor, contents:args.contents,
            items:args.mediaIds.map((id: number) => media.find(item => item.id === id)) };
          localStorage.setItem('album-content-test', JSON.stringify(next));
        }
        return [];
      },
    } });
  });
});

test('legacy album accepts a separate chapter, reloads, moves and deletes it without losing photos', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await reader.getByRole('button', { name:'챕터+', exact:true }).click();
  const editor = page.getByRole('dialog', { name:'챕터 상세' });
  await editor.getByLabel('삽입 위치').selectOption('2');
  await editor.getByLabel('챕터 제목', { exact:true }).fill('DAY 2 · 성산일출봉');
  await editor.getByLabel('부제목 또는 설명').fill('2026.05.15\n아침 바다');
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  await expect(reader.locator('.albumPaper.left .albumPagePhoto')).toHaveCount(2);
  if (info.project.name === 'mobile') await reader.getByLabel('앨범 책장 이동').fill('2');
  await expect(reader.locator('.albumWrittenPage')).toContainText('DAY 2 · 성산일출봉');
  await reader.getByRole('button', { name:'챕터 상세보기', exact:true }).click();
  await expect(editor.getByLabel('챕터 제목')).toHaveValue('DAY 2 · 성산일출봉');
  await editor.getByLabel('삽입 위치').selectOption('1');
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents[1].kind)).toBe('CHAPTER');
  if (info.project.name === 'mobile') await reader.getByLabel('앨범 책장 이동').fill('2');
  await reader.getByRole('button', { name:'챕터 상세보기', exact:true }).click();
  await editor.getByRole('button', { name:'삭제', exact:true }).click();
  await expect(editor).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!));
  expect(saved.items.map((item: { id: number }) => item.id)).toEqual([1,2,3,4,5,6]);
  expect(saved.contents.every((entry: { kind: string }) => entry.kind === 'PHOTO')).toBe(true);
});

test('text-only album can be saved, read, edited and removed through its letter detail after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await reader.getByRole('button', { name:'편지+', exact:true }).click();
  const letter = page.getByRole('dialog', { name:'편지 상세' });
  await letter.getByLabel('편지 제목', { exact:true }).fill('여행 마지막 날');
  await letter.getByLabel('편지 내용', { exact:true }).fill('별거 하지 않았는데\n이 날이 가장 기억에 남는다.');
  await letter.getByRole('button', { name:'저장', exact:true }).click();
  await expect(letter).toBeHidden();
  await reader.getByTitle('닫기', { exact:true }).click();
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await page.getByRole('button', { name:'앨범 수정', exact:true }).click();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await editor.getByRole('button', { name:'사진 관리 · 6', exact:true }).click();
  for (const photo of await editor.locator('.albumEditPhotos button').all()) await photo.click();
  await editor.getByRole('button', { name:'앨범에서 삭제 (6)', exact:true }).click();
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  await expect(reader.locator('.albumPaper.left .albumWrittenPage')).toContainText('이 날이 가장 기억에 남는다.');
  await reader.getByRole('button', { name:'편지 상세보기', exact:true }).click();
  await letter.getByLabel('편지 내용', { exact:true }).fill('다시 쓴 기록');
  await letter.getByRole('button', { name:'저장', exact:true }).click();
  await expect(letter).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents[0].body)).toBe('다시 쓴 기록');
  await reader.getByRole('button', { name:'편지 상세보기', exact:true }).click();
  await letter.getByRole('button', { name:'삭제', exact:true }).click();
  await expect(letter).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents)).toEqual([]);
});

test('mobile pages keep photo, chapter and text leaves in sequence without an empty final page', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Single-page reading sequence.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const media = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, file_path: `C:/chapter-photo-${i + 1}.jpg`, file_type: 'image',
      taken_at: '2026-05-15', width: 900, height: 600, title: `사진 ${i + 1}`, rating: 0, comment: '', favorite: false }));
    const photo = (id: number) => ({ id: `photo-${id}`, kind: 'PHOTO', media_id: id, title: '', body: '', display_duration: 5, transition_type: 'fade', comment_visible: true });
    localStorage.setItem('album-content-test', JSON.stringify({ id: 1, title: '제주 여행', description: '', created_at: '2026-05-15', items: media,
      contents: [photo(1), { ...photo(0), id: 'chapter', kind: 'CHAPTER', title: '둘째 날', body: '아침 바다' }, photo(2), photo(3),
        { ...photo(0), id: 'text', kind: 'TEXT', title: '여행 기록', body: '함께 걸었던 날' }] }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제주 여행 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumPaper')).toHaveCount(1);
  await expect(reader.locator('.albumPagerActions p')).toHaveText('1 / 4 페이지');
  await expect(reader.locator('.albumPagePhoto')).toHaveAttribute('data-media-id', '1');
  await reader.getByTitle('다음 책장', { exact: true }).click();
  await expect(reader.getByRole('article', { name: '챕터: 둘째 날' })).toContainText('아침 바다');
  await reader.getByTitle('다음 책장', { exact: true }).click();
  expect(await reader.locator('.albumPagePhoto').evaluateAll(elements => elements.map(element => element.getAttribute('data-media-id')))).toEqual(['2', '3']);
  await reader.getByTitle('다음 책장', { exact: true }).click();
  await expect(reader.getByRole('article', { name: '편지: 여행 기록' })).toContainText('함께 걸었던 날');
  await expect(reader.locator('.albumPagerActions p')).toHaveText('4 / 4 페이지');
  await expect(reader.getByTitle('다음 책장', { exact: true })).toBeDisabled();
  await reader.getByTitle('이전 책장', { exact: true }).click();
  await expect(reader.locator('.albumPageNumber')).toHaveText('03');
  await reader.getByLabel('앨범 책장 이동').fill('2');
  await expect(reader.getByRole('article', { name: '챕터: 둘째 날' })).toBeVisible();
});

test('album cover colors appear after saving and reloading without story controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정' });
  await expect(editor.getByRole('button', { name: '스토리 음악', exact: true })).toHaveCount(0);
  await expect(editor.getByText('스토리 설정', { exact: true })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: /^(챕터|편지)(\+)?$/ })).toHaveCount(0);
  await editor.getByRole('button', { name: '앨범 정보', exact: true }).click();
  await editor.getByRole('button', { name: '네이비 색상', exact: true }).click();
  const preview = editor.locator('.albumColorPreview .frontAlbumTone');
  await expect(preview).toHaveCSS('background-color', 'rgb(47, 64, 88)');
  await expect(preview).toHaveCSS('opacity', '0.9');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  const cover = page.locator('.savedAlbumOpen .frontAlbum');
  await expect(cover.locator('.frontAlbumTone')).toHaveCSS('background-color', 'rgb(47, 64, 88)');
  await expect(cover.locator('.frontAlbumTone')).toHaveCSS('opacity', '0.9');
  await expect(cover.locator('.frontAlbumTitle')).toHaveCSS('color', 'rgb(255, 253, 248)');
  await page.reload();
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await expect(cover.locator('.frontAlbumTone')).toHaveCSS('background-color', 'rgb(47, 64, 88)');
  await page.getByRole('button', { name: '제주 여행 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader).toBeVisible();
  await expect(reader.getByRole('button', { name: '스토리로 보기', exact: true })).toHaveCount(0);
  await reader.getByTitle('닫기', { exact: true }).click();
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  await expect(page.locator('.quickAlbum .frontAlbumTone')).toHaveCSS('background-color', 'rgb(47, 64, 88)');
  await expect(page.locator('.quickAlbum .frontAlbumTone')).toHaveCSS('opacity', '0.9');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  await editor.getByRole('button', { name: '앨범 정보', exact: true }).click();
  await editor.getByLabel('직접 색상 선택').fill('#6A4538');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(cover.locator('.frontAlbumTone')).toHaveCSS('background-color', 'rgb(106, 69, 56)');
  await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  await editor.getByRole('button', { name: '앨범 정보', exact: true }).click();
  await editor.getByRole('button', { name: '아이보리 색상', exact: true }).click();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(cover.locator('.frontAlbumTone')).toHaveCSS('opacity', '0');
  await expect(cover.locator('.frontAlbumTitle')).toHaveCSS('color', 'rgb(48, 49, 41)');
});

test('reader places writing actions above the album and opens distinct unfocused detail dialogs', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제주 여행 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.locator('.albumJournalHeader .albumJournalAdd')).toHaveCount(0);
  const actions = (await reader.locator('.albumJournalCanvas .albumJournalAdd').boundingBox())!;
  const book = (await reader.locator('.albumBookStage').boundingBox())!;
  expect(actions.y + actions.height).toBeLessThanOrEqual(book.y);
  expect(Math.abs(actions.x - book.x)).toBeLessThan(2);
  await page.screenshot({ path: `test-results/album-appearance-actions-${info.project.name}.png` });
  if (info.project.name === 'mobile') await reader.getByLabel('앨범 책장 이동').fill('2');
  await reader.getByRole('button', { name: '챕터+', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '챕터 상세' });
  await expect(editor).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.matches('input,textarea'))).toBe(false);
  await expect(editor.locator('.albumEditorTabs')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: /^(챕터|편지)(추가|\+)$/ })).toHaveCount(0);
  await expect(editor.getByLabel('편지 제목', { exact: true })).toHaveCount(0);
  await expect(editor.locator('.albumContentToolbar button')).toHaveCount(0);
  await editor.getByLabel('챕터 제목', { exact: true }).fill('새로운 장');
  await editor.getByLabel('부제목 또는 설명').fill('여행의 다음 순간');
  const writing = (await editor.locator('.albumEntryEditor').boundingBox())!;
  const picker = (await editor.getByLabel('앨범 장 선택', { exact: true }).boundingBox())!;
  expect(picker.x).toBeGreaterThanOrEqual(writing.x + writing.width);
  expect(picker.x + picker.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `test-results/album-appearance-writing-${info.project.name}.png` });
  await editor.locator('.albumContentRow button').first().click();
  await expect(editor.getByLabel('삽입 위치')).toHaveValue('1');
  await expect(editor.getByLabel('챕터 제목', { exact: true })).toHaveValue('새로운 장');
  await editor.getByLabel('삽입 위치').selectOption('4');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!));
  expect(saved.contents[4]).toMatchObject({ kind: 'CHAPTER', title: '새로운 장' });
  expect(saved.items).toHaveLength(6);
  await reader.getByRole('button', { name: '편지+', exact: true }).click();
  const letter = page.getByRole('dialog', { name: '편지 상세' });
  await expect(letter).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.matches('input,textarea'))).toBe(false);
  await expect(letter.getByLabel('챕터 제목', { exact: true })).toHaveCount(0);
  await expect(letter.locator('.albumContentToolbar button')).toHaveCount(0);
  await letter.getByLabel('편지 제목', { exact: true }).fill('저장하지 않은 편지');
  await letter.getByRole('button', { name: '취소', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents.length)).toBe(7);
  await reader.getByLabel('앨범 책장 이동').fill(info.project.name === 'mobile' ? '3' : '2');
  await expect(reader.locator('.albumWrittenPage')).toContainText('새로운 장');
  await expect(reader.locator('.albumOutline')).toHaveCount(0);
  await page.screenshot({ path: `test-results/album-appearance-written-reader-${info.project.name}.png` });
});

test('mobile horizontal touch drag follows the finger and turns once without opening a photo', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'mobile', 'Real mobile touch gestures.');
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제주 여행 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  const spread = reader.locator('.albumSpread');
  const label = reader.locator('.albumPagerActions p');
  const box = (await spread.boundingBox())!;
  const client = await context.newCDPSession(page);
  async function drag(dx: number, dy = 0, cancel = false) {
    const x = box.x + box.width * (dx < 0 ? .8 : .2), y = box.y + box.height * .5;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const part of [.25, .5, .75, 1]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * part, y: y + dy * part }] });
    if (Math.abs(dx) > 40 && !dy) {
      await expect(spread).toHaveAttribute('data-dragging', 'true');
      expect(await spread.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).not.toBe(0);
    }
    await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  }
  await drag(-box.width * .55);
  await expect(reader.locator('.albumTurningSheet')).toBeVisible();
  await expect(label).toHaveText('2 / 3 페이지');
  await expect(reader.locator('.albumTurningSheet')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toHaveCount(0);
  await drag(box.width * .55);
  await expect(label).toHaveText('1 / 3 페이지');
  await expect(reader.locator('.albumTurningSheet')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await drag(-20);
  await expect(label).toHaveText('1 / 3 페이지');
  await drag(-5, 80);
  await expect(label).toHaveText('1 / 3 페이지');
  await drag(-box.width * .55, 0, true);
  await expect(spread).toHaveAttribute('data-dragging', 'false');
  await expect(label).toHaveText('1 / 3 페이지');
  await drag(box.width * .55);
  await expect(label).toHaveText('1 / 3 페이지');
  await reader.getByLabel('앨범 책장 이동').fill('3');
  await drag(-box.width * .55);
  await expect(label).toHaveText('3 / 3 페이지');
});
