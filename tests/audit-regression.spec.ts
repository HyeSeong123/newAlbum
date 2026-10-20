import { expect, test } from '@playwright/test';

import { auditLibrary as library } from './audit-fixture';

test('native import of 100 dog and 100 cat records never authorizes inference', async ({ page }) => {
  let inferenceRequests = 0;
  page.on('worker', () => inferenceRequests++);
  await library(page, true);
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  await page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true }).getByRole('button', { name: /^(파일 선택|갤러리 열기)$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: '사진과 영상 200개를 가져왔습니다.' })).toBeVisible();
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__auditCalls.filter((command: string) => ['enqueue_pet_jobs', 'prepare_pet_input', 'control_pet_jobs'].includes(command)))).toEqual([]);
  expect(inferenceRequests).toBe(0);
});

test('long press then touch drag selects a range without scrolling or a duplicate click', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Native touch input requires a mobile context.');
  await library(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '가족 24장', exact: true }).click();
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  await page.getByRole('button', { name: '사진 정리', exact: true }).click();
  const tiles = page.getByRole('button', { name: '얼굴 선택', exact: true });
  await tiles.first().scrollIntoViewIfNeeded();
  const a = (await tiles.nth(0).boundingBox())!, b = (await tiles.nth(1).boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => scrollY);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }] });
  await page.waitForTimeout(550);
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(1);
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.personOriginal[aria-pressed="true"]')).toHaveCount(2);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await client.detach();
});

test('album creation traps keyboard focus and restores its opening control', async ({ page }) => {
  await library(page);
  await page.getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '사진 선택', exact: true }).click();
  await page.getByRole('button', { name: '현재 결과 전체 선택 (200개)', exact: true }).click();
  const opener = page.getByRole('button', { name: '앨범 만들기', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '앨범 만들기', exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByTitle('닫기', { exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await close.click();
  await expect(opener).toBeFocused();
});

test('Android back dismisses the open action menu before leaving its screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Android bridge is active only with the mobile user agent.');
  await library(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '가족 24장', exact: true }).click();
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  await expect(page.locator('.actionMenuPanel')).toBeVisible();
  expect(await page.evaluate(() => window.__gamjassakBack?.())).toBe(true);
  await expect(page.locator('.actionMenuPanel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '가족', exact: true })).toBeVisible();
});

for (const response of [[], { items: [], done: false, nextCursor: 0 }, { items: [], done: false }]) {
  test(`removed inference never invokes malformed source audit: ${JSON.stringify(response)}`, async ({ page }) => {
    await library(page);
    await page.evaluate(response => {
      const bridge = (window as any).__TAURI_INTERNALS__;
      const original = bridge.invoke;
      bridge.invoke = (command: string, args: unknown) => command === 'audit_person_scans' ? Promise.resolve(response) : original(command, args);
    }, response);
    await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
    await expect(page.getByRole('button', { name: '사진에서 사람 찾기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '사람 직접 등록', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => (window as any).__auditCalls.includes('audit_person_scans'))).toBe(false);
    expect(await page.evaluate(() => (window as any).__auditCalls.includes('enqueue_person_jobs'))).toBe(false);
  });
}

test('album photo management reuses range selection and cancel preserves the saved album', async ({ page, isMobile }) => {
  await library(page);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.locator('.savedAlbumFooter .actionMenuTrigger').click();
  await page.getByRole('button', { name: '앨범 수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '앨범 수정', exact: true });
  await dialog.getByRole('button', { name: /사진 관리/ }).click();
  const tiles = dialog.locator('.albumEditPhotos > button');
  await tiles.first().scrollIntoViewIfNeeded();
  const a = (await tiles.nth(0).boundingBox())!, b = (await tiles.nth(1).boundingBox())!;
  if (isMobile) {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }] });
    await page.waitForTimeout(550);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await page.mouse.move(a.x + 10, a.y + 10); await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 10, { steps: 5 }); await page.mouse.up();
  }
  await expect(dialog.locator('.albumEditPhotos > button[aria-pressed="true"]')).toHaveCount(2);
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '함께한 가을 앨범 열기', exact: true }).click();
  await expect(page.locator('.albumJournalHeading')).toContainText('사진 6장');
});
