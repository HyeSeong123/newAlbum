import { expect, test } from '@playwright/test';
import { installRecordFixture } from './record-fixture';

test('memory detail Back restores its card and the new section controls fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installRecordFixture(page); await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  const sections = page.getByRole('group', { name: '추억 보기', exact: true });
  for (const name of ['그날 다시', '시간 산책', '추억 지도']) {
    const button = sections.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  const card = page.locator('.memoryGroupCard').first();
  await card.click();
  await expect(page.locator('.memoryDetailHeader h2')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.memoryDetailHeader')).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.getByRole('textbox', { name: '사진과 추억 검색', exact: true }).fill('없는 이야기');
  await expect(page.locator('.memoryGroupCard')).toHaveCount(0);
  await page.getByRole('button', { name: '모든 추억 보기', exact: true }).click();
  await expect(page.locator('.memoryGroupCard')).toHaveCount(2);
});

test('reentering memories after the map restores rediscovery and its search toolbar', async ({ page }) => {
  await installRecordFixture(page); await page.goto('/');
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('group', { name: '추억 보기', exact: true }).getByRole('button', { name: '추억 지도', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '사진과 추억 검색', exact: true })).toHaveCount(0);
  await page.locator('.navList').getByRole('button', { name: '홈', exact: true }).click();
  await page.locator('.navList').getByRole('button', { name: '추억', exact: true }).click();
  await expect(page.getByRole('group', { name: '추억 보기', exact: true }).getByRole('button', { name: '그날 다시', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '사진과 추억 검색', exact: true })).toBeVisible();
});
test('memories switch between today and month and open the same records in the album reader', async ({ page }) => {
  await installRecordFixture(page);
  await page.goto('/');
  await page.getByRole('button',{ name:'추억',exact:true }).click();
  await expect(page.locator('.memoryGroupCard')).toHaveCount(2);
  await expect(page.getByRole('button',{ name:/^3년 전 오늘/ })).toContainText('사진 2장');
  await page.getByRole('button',{ name:'몇 년 전 이번 달',exact:true }).click();
  const month = page.getByRole('button',{ name:/^3년 전 이번 달/ });
  await expect(month).toContainText('사진 2장 · 영상 1개');
  await month.click();
  await expect(page.locator('.recordMediaGrid>button')).toHaveCount(3);
  await page.getByRole('button',{ name:'첫 가을 상세보기',exact:true }).click();
  await expect(page.getByRole('dialog',{ name:'사진 상세' })).toBeVisible();
  await page.getByRole('dialog',{ name:'사진 상세' }).getByTitle('닫기',{ exact:true }).click();
  await page.getByRole('button',{ name:'추억책 펼치기',exact:true }).click();
  await expect(page.getByRole('dialog',{ name:'앨범 전체창' })).toBeVisible();
  await expect(page.getByRole('button',{ name:'스토리로 보기',exact:true })).toHaveCount(0);
  await page.getByRole('dialog',{ name:'앨범 전체창' }).getByTitle('닫기',{ exact:true }).click();
  await page.getByRole('button',{ name:'그날 목록',exact:true }).click();
  await expect(page.locator('.memoryGroupCard')).toHaveCount(2);
});
