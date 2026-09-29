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

test('legacy album accepts a chapter at a chosen position, reloads, moves and deletes it without losing photos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  const openEditor = async () => {
    await page.locator('.savedAlbumFooter .actionMenuTrigger').first().click();
    await page.getByRole('button', { name:'앨범 수정', exact:true }).click();
    await page.getByRole('dialog', { name:'앨범 수정' }).getByRole('button', { name:'챕터·감상문', exact:true }).click();
  };
  await openEditor();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await editor.getByLabel('삽입 위치').selectOption('2');
  await editor.getByRole('button', { name:'챕터 추가', exact:true }).click();
  await editor.getByLabel('챕터 제목', { exact:true }).fill('DAY 2 · 성산일출봉');
  await editor.getByLabel('부제목 또는 설명').fill('2026.05.15\n아침 바다');
  await editor.getByRole('button', { name:'저장', exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'내 앨범', exact:true }).click();
  await page.getByRole('button', { name:'제주 여행 앨범 열기', exact:true }).click();
  const reader = page.getByRole('dialog', { name:'앨범 전체창' });
  await expect(reader.locator('.albumPaper.right .albumWrittenPage')).toContainText('DAY 2 · 성산일출봉');
  await expect(reader.locator('.albumPaper.left .albumPagePhoto')).toHaveCount(2);
  await reader.getByRole('button', { name:'앨범 수정', exact:true }).click();
  await page.getByRole('dialog', { name:'앨범 수정' }).getByRole('button', { name:'챕터·감상문', exact:true }).click();
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
    await page.getByRole('dialog', { name:'앨범 수정' }).getByRole('button', { name:'챕터·감상문', exact:true }).click();
  };
  await openEditor();
  const editor = page.getByRole('dialog', { name:'앨범 수정' });
  await editor.getByRole('button', { name:'감상문 추가', exact:true }).click();
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
