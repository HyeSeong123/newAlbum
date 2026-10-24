import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { auditLibrary } from './audit-fixture';

const before = process.env.UX_AUDIT_STAGE === 'before';
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `preview-results/ux-convenience/${before ? 'before' : 'after'}/${name}-${info.project.name}.png` });
}
async function go(page: Page, name: string) {
  await page.locator('.navList').getByRole('button', { name, exact: true }).click();
}
async function editAlbum(page: Page) {
  await go(page, '내 앨범');
  await page.getByRole('button', { name: '함께한 가을 앨범 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  return page.getByRole('dialog', { name: '앨범 수정', exact: true });
}

// Removing the dirty-close guard must discard the draft and fail these cases.
for (const [index, action] of ['닫기', '취소', 'Escape'].entries()) {
  test(`album dirty ${action} preserves changes when discard is declined`, async ({ page }, info) => {
    await auditLibrary(page);
    const editor = await editAlbum(page);
    await editor.getByLabel('제목', { exact: true }).fill('지켜 둘 앨범 이름');
    let confirmations = 0;
    page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await editor.getByRole('button', { name: action, exact: true }).click();
    if (before) {
      await expect(editor).toHaveCount(0);
      expect(confirmations).toBe(0);
    } else {
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('제목', { exact: true })).toHaveValue('지켜 둘 앨범 이름');
      expect(confirmations).toBe(1);
    }
    await capture(page, info, `0${index + 1}-album-${action === 'Escape' ? 'back' : action === '닫기' ? 'close' : 'cancel'}`);
    if (!before) {
      page.removeAllListeners('dialog');
      page.once('dialog', dialog => dialog.accept());
      await editor.getByRole('button', { name: '취소', exact: true }).click();
      await expect(editor).toHaveCount(0);
      await editAlbum(page);
      await expect(editor.getByLabel('제목', { exact: true })).toHaveValue('함께한 가을');
    }
  });
}

test('album successful save closes without discard confirmation and survives reopening', async ({ page }) => {
  await auditLibrary(page);
  await page.evaluate(async () => {
    const bridge = (window as any).__TAURI_INTERNALS__, original = bridge.invoke;
    (window as any).__recordAlbumWrites = [];
    bridge.invoke = async (command: string, args: unknown) => {
      if (command === 'update_album') { (window as any).__recordAlbumWrites.push(args); return null; }
      return original(command, args);
    };
  });
  const editor = await editAlbum(page);
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
  await editor.getByLabel('제목', { exact: true }).fill('저장한 가을');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(confirmations).toBe(0);
  expect(await page.evaluate(() => (window as any).__recordAlbumWrites)).toEqual([
    expect.objectContaining({ id: 1, title: '저장한 가을', mediaIds: [1, 2, 3, 4, 5, 6] }),
  ]);
  await page.getByRole('button', { name: '저장한 가을 앨범 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  await expect(editor.getByLabel('제목', { exact: true })).toHaveValue('저장한 가을');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(confirmations).toBe(0);
});

test('album cannot close while its save is pending', async ({ page }) => {
  await auditLibrary(page);
  await page.evaluate(() => {
    const bridge = (window as any).__TAURI_INTERNALS__, original = bridge.invoke;
    bridge.invoke = async (command: string, args: unknown) => {
      if (command === 'update_album') return new Promise(resolve => { (window as any).__finishAlbumSave = resolve; });
      return original(command, args);
    };
  });
  const editor = await editAlbum(page);
  await editor.getByLabel('제목', { exact: true }).fill('저장 중인 앨범');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor.getByRole('button', { name: '저장 중', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button', { name: '취소', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).__finishAlbumSave(null));
  await expect(editor).toHaveCount(0);
});

async function diaryFixture(page: Page) {
  await auditLibrary(page);
  await page.evaluate(async () => {
    const bridge = (window as any).__TAURI_INTERNALS__, original = bridge.invoke;
    const diaries = await original('list_diary');
    (window as any).__recordAssignments = [];
    bridge.invoke = async (command: string, args: any) => {
      if (command === 'list_diary') return diaries;
      if (command === 'assign_diary_album') {
        (window as any).__recordAssignments.push(args);
        diaries.forEach((entry: { id: number; album_id: number | null }) => { if (args.ids.includes(entry.id)) entry.album_id = args.albumId; });
        return null;
      }
      return original(command, args);
    };
  });
  await go(page, '일기장');
}

// Losing selection reset on any result-changing control must fail these cases.
for (const [index, control] of ['검색', '검색 지우기', '전체 일기', '이전 달', '월 선택'].entries()) {
  test(`diary ${control} clears stale selection before album assignment`, async ({ page }, info) => {
    await diaryFixture(page);
    const search = page.getByRole('textbox', { name: '일기 검색', exact: true });
    if (control === '검색 지우기') await search.fill('가을');
    await page.getByRole('button', { name: '선택', exact: true }).click();
    const bar = page.getByRole('region', { name: '선택한 일기 관리' });
    await bar.getByRole('button', { name: '현재 결과 전체 선택', exact: true }).click();
    await expect(bar).toContainText('일기 1편 선택');
    if (control === '검색') await search.fill('바다');
    else if (control === '검색 지우기') await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
    else if (control === '월 선택') await page.getByLabel('일기 월 선택', { exact: true }).fill('2026-09');
    else await page.getByRole('button', { name: control, exact: true }).click();
    if (before && !['이전 달', '월 선택'].includes(control)) await expect(bar).toContainText('일기 1편 선택');
    else {
      await expect(bar).toContainText('일기 0편 선택');
      await expect(bar.getByRole('button', { name: '앨범 연결 저장', exact: true })).toBeDisabled();
    }
    await capture(page, info, `0${index + 4}-diary-selection-${index + 1}`);
    expect(await page.evaluate(() => (window as any).__recordAssignments)).toEqual([]);
  });
}

test('diary can link a newly selected result after clearing a search', async ({ page }) => {
  await diaryFixture(page);
  await page.getByRole('textbox', { name: '일기 검색', exact: true }).fill('가을');
  await page.getByRole('button', { name: '선택', exact: true }).click();
  const bar = page.getByRole('region', { name: '선택한 일기 관리' });
  await bar.getByRole('button', { name: '현재 결과 전체 선택', exact: true }).click();
  await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
  await bar.getByRole('button', { name: '현재 결과 전체 선택', exact: true }).click();
  await bar.getByLabel('선택한 일기의 앨범').selectOption('1');
  await bar.getByRole('button', { name: '앨범 연결 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '앨범 연결을 저장했습니다.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__recordAssignments)).toEqual([{ ids: [1], albumId: 1 }]);
  await expect(page.locator('.diaryCardFoot')).toContainText('함께한 가을');
  await page.getByRole('button', { name: '선택 취소', exact: true }).first().click();
  await page.locator('.diaryOpen').click();
  await expect(page.getByRole('dialog').getByLabel('앨범', { exact: true })).toHaveValue('1');
});
