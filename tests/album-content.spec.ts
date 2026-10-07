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

test('legacy album accepts a chapter at a chosen position, reloads, moves and deletes it without losing photos', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  const openEditor = async () => {
    await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
    await page.getByRole('button', { name:'앨범 수정', exact:true }).click();
  };
  await openEditor();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await editor.getByLabel('삽입 위치').selectOption('2');
  await editor.getByRole('button', { name:'챕터+', exact:true }).click();
  await editor.getByLabel('챕터 제목', { exact:true }).fill('DAY 2 · 성산일출봉');
  await editor.getByLabel('부제목 또는 설명').fill('2026.05.15\n아침 바다');
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await expect(reader.locator('.albumPaper.left .albumPagePhoto')).toHaveCount(2);
  if (info.project.name === 'mobile') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await reader.getByTitle('다음 책장', { exact: true }).click();
    await expect(reader.locator('.albumPagerActions p')).toHaveText('2 / 4 페이지');
    await expect(reader.locator('.albumPaper')).toHaveCount(1);
  }
  await expect(reader.locator('.albumWrittenPage')).toContainText('DAY 2 · 성산일출봉');
  if (!await reader.getByRole('button', { name:'앨범 수정', exact:true }).isVisible())
    await reader.getByRole('button', { name:'앨범 보기 옵션', exact:true }).click();
  await page.getByRole('button', { name:'앨범 수정', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'앨범 수정' }).getByLabel('챕터 제목')).toHaveValue('DAY 2 · 성산일출봉');
  await page.getByRole('dialog', { name:'앨범 수정' }).getByRole('button', { name:'취소', exact:true }).click();
  await reader.getByTitle('닫기', { exact:true }).click();
  await openEditor();
  await editor.getByRole('button', { name:'3번 항목 위로', exact:true }).click();
  await expect(editor.locator('.albumContentRow').nth(1)).toHaveClass(/kind-chapter/);
  await editor.getByRole('button', { name:'2번 항목 삭제', exact:true }).click();
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!));
  expect(saved.items.map((item: { id: number }) => item.id)).toEqual([1,2,3,4,5,6]);
  expect(saved.contents.every((entry: { kind: string }) => entry.kind === 'PHOTO')).toBe(true);
});

test('text-only album can be saved, read, edited and removed after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  const openEditor = async () => {
    await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
    await page.getByRole('button', { name:'앨범 수정', exact:true }).click();
  };
  await openEditor();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await editor.getByLabel('삽입 위치').selectOption('6');
  await editor.getByRole('button', { name:'편지+', exact:true }).click();
  await editor.getByLabel('감상문 제목', { exact:true }).fill('여행 마지막 날');
  await editor.getByLabel('감상문 내용', { exact:true }).fill('별거 하지 않았는데\n이 날이 가장 기억에 남는다.');
  for (let i = 0; i < 6; i++) {
    await editor.locator('.albumContentRow').first().getByRole('button').click();
    await editor.getByRole('button', { name:'1번 항목 삭제', exact:true }).click();
  }
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await expect(reader.locator('.albumPaper.left .albumWrittenPage')).toContainText('이 날이 가장 기억에 남는다.');
  await reader.getByTitle('닫기', { exact:true }).click();
  await openEditor();
  await editor.getByLabel('감상문 내용', { exact:true }).fill('다시 쓴 기록');
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents[0].body)).toBe('다시 쓴 기록');
  await openEditor();
  await editor.getByRole('button', { name:'1번 항목 삭제', exact:true }).click();
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
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
  await expect(reader.getByRole('article', { name: '글·일기: 여행 기록' })).toContainText('함께 걸었던 날');
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

test('reader adds writing after the current page, keeps the picker on the right, and cancels without saving', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '제주 여행 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await expect(reader.getByRole('button', { name: '사진 목록', exact: true })).toHaveCount(0);
  if (info.project.name === 'mobile') await reader.getByLabel('앨범 책장 이동').fill('2');
  await reader.getByRole('button', { name: '챕터+', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '앨범 수정' });
  await editor.getByLabel('챕터 제목', { exact: true }).fill('새로운 장');
  await editor.getByLabel('부제목 또는 설명').fill('여행의 다음 순간');
  const writing = (await editor.locator('.albumEntryEditor').boundingBox())!;
  const picker = (await editor.getByLabel('앨범 장 선택', { exact: true }).boundingBox())!;
  expect(picker.x).toBeGreaterThanOrEqual(writing.x + writing.width);
  expect(picker.x + picker.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `test-results/album-appearance-writing-${info.project.name}.png` });
  await editor.getByRole('button', { name: '감상문', exact: true }).click();
  await expect(editor.getByLabel('챕터 제목', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: '챕터', exact: true }).click();
  await expect(editor.getByLabel('챕터 제목', { exact: true })).toHaveValue('새로운 장');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!));
  expect(saved.contents[4]).toMatchObject({ kind: 'CHAPTER', title: '새로운 장' });
  expect(saved.items).toHaveLength(6);
  await reader.getByRole('button', { name: '편지+', exact: true }).click();
  await editor.getByLabel('감상문 제목', { exact: true }).fill('저장하지 않은 편지');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('album-content-test')!).contents.length)).toBe(7);
  await reader.getByLabel('앨범 책장 이동').fill(info.project.name === 'mobile' ? '3' : '2');
  await expect(reader.locator('.albumWrittenPage')).toContainText('새로운 장');
  await expect(reader.locator('.albumOutline')).toHaveCount(0);
  await page.screenshot({ path: `test-results/album-appearance-written-reader-${info.project.name}.png` });
});
