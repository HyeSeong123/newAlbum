import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditLibrary } from './audit-fixture';

// Prepared for the combined browser run; native storage uses isolated samples.
async function openLibrary(page: Page) {
  await auditLibrary(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
}

async function expectControl(button: Locator) {
  await expect(button).toBeVisible();
  const size = await button.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
}

for (const width of [320, 393]) {
  test(`photo detail tools and nested dialogs stay usable at ${width}px`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone controls.');
    await page.setViewportSize({ width, height: 780 });
    await openLibrary(page);
    await page.locator('.mediaTile').first().click();
    const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
    for (const button of await detail.locator('.detailHeader button, .detailActionButtons button, .detailZoomControls button, .rating button, .photoTitleControls button, .petPhotoResults > button').all()) {
      await button.scrollIntoViewIfNeeded();
      await expectControl(button);
    }
    for (const button of await detail.locator('.petPhotoResults > button').all()) {
      await expect(button).toHaveCSS('border-top-style', 'solid');
      await expect(button).toHaveCSS('border-radius', '6px');
    }
    await detail.getByRole('button', { name: '반려동물 직접 추가', exact: true }).click();
    const manual = page.getByRole('dialog', { name: '반려동물 직접 추가', exact: true });
    await manual.getByText('영역 크기 조정', { exact: true }).click();
    await expect(manual.getByLabel('가로 위치 (%)', { exact: true })).toBeVisible();
    await manual.getByRole('button', { name: '취소', exact: true }).click();
    await expect(manual).toHaveCount(0);
    await expect(detail).toBeVisible();
    await detail.getByTitle('확대 보기', { exact: true }).click();
    const zoom = page.getByRole('dialog', { name: '사진 확대 보기', exact: true });
    const help = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
    const helpId = await help.getAttribute('id');
    expect(helpId).toBeTruthy();
    await expect(zoom).toHaveAttribute('aria-owns', helpId!);
    for (const button of await zoom.locator('.photoZoomToolbar button').all()) await expectControl(button);
    expect(await zoom.locator('.photoZoomToolbar').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Tab');
      expect(await zoom.evaluate((node, ownedId) => node.contains(document.activeElement) || document.activeElement?.id === ownedId, helpId)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await expect(detail.getByTitle('확대 보기', { exact: true })).toBeFocused();
    await detail.locator('.detailSidebar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `preview-results/photo-record-controls/detail-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('cancelled region drafts are discarded and do not write photo data', async ({ page }) => {
  await openLibrary(page);
  await page.locator('.mediaTile').first().click();
  const region = page.getByRole('dialog', { name: '사진 상세', exact: true }).getByRole('region', { name: '위치', exact: true });
  await region.getByRole('button', { name: '지역 지정', exact: true }).click();
  await region.getByLabel('지정할 지역', { exact: true }).selectOption('KR-11');
  await region.getByLabel('해외 지역', { exact: true }).check();
  await region.getByLabel('나라', { exact: true }).fill('일본');
  await region.getByLabel('도시', { exact: true }).fill('교토');
  await region.getByRole('button', { name: '취소', exact: true }).click();
  await region.getByRole('button', { name: '지역 지정', exact: true }).click();
  await expect(region.getByLabel('해외 지역', { exact: true })).not.toBeChecked();
  await expect(region.getByLabel('지정할 지역', { exact: true })).toHaveValue('');
  await expect(region.getByRole('button', { name: '지역 저장', exact: true })).toBeDisabled();
  for (const button of await region.locator('.regionEditorActions button').all()) await expectControl(button);
  expect(await page.evaluate(() => (window as any).__auditCalls.filter((command: string) => command === 'assign_media_region'))).toEqual([]);
});

test('import optional fields keep cancel and file selection designed and reachable', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: '사진·영상 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '사진·영상 가져오기', exact: true });
  await dialog.getByRole('radio', { name: '폴더 가져오기', exact: true }).check();
  await dialog.getByRole('checkbox', { name: /가져오면서 앨범 만들기/ }).check();
  await expect(dialog.getByRole('button', { name: '폴더 선택', exact: true })).toBeDisabled();
  await dialog.getByLabel('앨범 제목', { exact: true }).fill('가을 사진');
  await dialog.getByRole('button', { name: '세이지 색상', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /달력에 등록하기/ }).check();
  await dialog.getByLabel('달력 등록 날짜 방식', { exact: true }).selectOption('range');
  await dialog.getByLabel('달력 종료일', { exact: true }).scrollIntoViewIfNeeded();
  for (const button of await dialog.locator('.mediaImportActions button').all()) {
    await expectControl(button);
    await expect(button).toHaveCSS('border-top-style', 'solid');
    await expect(button).toBeInViewport();
    await expect(button).toHaveCSS('white-space', 'nowrap');
    expect(await button.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await expect(dialog.getByRole('button', { name: '폴더 선택', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__auditCalls.filter((command: string) => ['register_paths', 'choose_android_gallery', 'choose_android_directory'].includes(command)))).toEqual([]);
});
