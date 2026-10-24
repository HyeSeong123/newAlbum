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
  const menu = page.getByRole('button', { name: '함께한 가을 앨범 메뉴', exact: true });
  if (before) {
    await menu.scrollIntoViewIfNeeded();
    const covered = () => menu.evaluate(button => {
      const box = button.getBoundingClientRect();
      return !button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    if (await covered()) {
      await capture(page, test.info(), `00-album-menu-covered-${test.info().title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 64)}`);
      await page.mouse.move(100, 400);
      await page.mouse.wheel(0, 1200);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      test.skip(await covered(), 'Baseline fixed help still covers the album menu after ordinary scrolling; no force click.');
    }
  }
  await menu.click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  return page.getByRole('dialog', { name: '앨범 수정', exact: true });
}

test('fixed help leaves album menu and diary save controls fully reachable at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await auditLibrary(page);
  await go(page, '내 앨범');
  const menu = page.getByRole('button', { name: '함께한 가을 앨범 메뉴', exact: true });
  await menu.scrollIntoViewIfNeeded();
  const help = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  const initial = (await help.boundingBox())!;
  await page.mouse.move(100, 400); await page.mouse.wheel(0, 1200);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const settled = (await help.boundingBox())!;
  expect(Math.abs(initial.y - settled.y)).toBeLessThan(2);
  await capture(page, info, '13-album-menu-help-clearance');
  if (before) return;
  await menu.click();
  await page.keyboard.press('Escape');
  await go(page, '일기장');
  await page.getByRole('button', { name: '일기 쓰기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 일기', exact: true });
  await dialog.getByLabel('제목', { exact: true }).fill('도움말 옆 저장');
  await expect(dialog.locator('.diaryDialogActions button')).toHaveCount(2);
  for (const action of await dialog.locator('.diaryDialogActions button').all()) {
    const a = (await action.boundingBox())!, h = (await help.boundingBox())!;
    expect(a.x + a.width <= h.x || a.x >= h.x + h.width || a.y + a.height <= h.y || a.y >= h.y + h.height).toBe(true);
    expect(await action.evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(320);
  }
  await capture(page, info, '14-diary-save-help-clearance');
  await dialog.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('.diaryOpen').filter({ hasText: '가을 산책' }).click();
  await page.getByRole('dialog', { name: '일기 상세', exact: true }).getByRole('button', { name: '일기 수정', exact: true }).click();
  const existing = page.getByRole('dialog', { name: '일기 수정', exact: true });
  await expect(existing.locator('.diaryDialogActions button')).toHaveCount(3);
  await expect(existing.getByRole('button', { name: '일기 삭제', exact: true })).toBeVisible();
  for (const action of await existing.locator('.diaryDialogActions button').all()) {
    const a = (await action.boundingBox())!, h = (await help.boundingBox())!;
    expect(a.x + a.width <= h.x || a.x >= h.x + h.width || a.y + a.height <= h.y || a.y >= h.y + h.height).toBe(true);
    expect(await action.evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(320);
    expect(a.y + a.height).toBeLessThanOrEqual(740);
  }
  await capture(page, info, '15-diary-edit-actions-help-clearance');
  await existing.getByRole('button', { name: '취소', exact: true }).click();
  await expect(existing).toHaveCount(0);
});

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
  await page.getByRole('dialog', { name: '일기 상세', exact: true }).getByRole('button', { name: '일기 수정', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('앨범', { exact: true })).toHaveValue('1');
});
