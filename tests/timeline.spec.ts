import { expect, test } from '@playwright/test';
import { installRecordFixture } from './record-fixture';

test('timeline preserves date groups, counts, notes and navigation into a day', async ({ page }) => {
  await installRecordFixture(page); await page.goto('/');
  await page.getByRole('button',{ name:'지난 추억',exact:true }).click();
  await page.getByRole('button',{ name:'우리의 기록',exact:true }).click();
  const timeline = page.getByRole('region',{ name:'우리의 기록 타임라인',exact:true });
  await timeline.getByRole('button',{ name:'2023년 기록',exact:true }).click();
  const autumn = timeline.getByRole('button',{ name:'2023년 9월 27일 · 사진 2장',exact:true });
  await expect(autumn).toBeVisible();
  await expect(timeline.getByRole('button',{ name:'2023년 9월 18일 · 영상 1개',exact:true })).toBeVisible();
  await expect(timeline.getByRole('button',{ name:/2023년 9월 19일/ })).toHaveCount(0);
  await autumn.click();
  await expect(page.getByRole('heading',{ name:'2023년 9월 27일',exact:true })).toBeVisible();
  await expect(page.locator('.recordMediaGrid>button')).toHaveCount(2);
  await page.getByRole('button',{ name:'첫 가을 상세보기',exact:true }).click();
  await expect(page.getByRole('dialog',{ name:'사진 상세' })).toBeVisible();
  await page.getByRole('dialog',{ name:'사진 상세' }).getByTitle('닫기',{ exact:true }).click();
  await page.getByRole('button',{ name:'타임라인으로 돌아가기',exact:true }).click();
  await timeline.getByRole('button',{ name:'2023년 8월 기록',exact:true }).click();
  const summer = timeline.getByRole('button',{ name:'2023년 8월 12일 · 사진 1장',exact:true });
  await expect(summer).toContainText('여름휴가');
  await summer.click();
  await expect(page.locator('.timelineDetailHeader')).toContainText('여름휴가 · 바다에서 함께 보낸 하루');
  await page.getByRole('button',{ name:'타임라인으로 돌아가기',exact:true }).click();
  await timeline.getByRole('button',{ name:'날짜 없는 기록 · 사진 2장',exact:true }).click();
  await expect(page.locator('.recordMediaGrid>button')).toHaveCount(2);
});

test('three photo view tabs support keyboard wrap and fit the mobile viewport', async ({ page }) => {
  await installRecordFixture(page); await page.goto('/');
  const tabs = page.getByRole('tablist',{ name:'사진 보기 방식' });
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  await page.getByRole('tab',{ name:'그리드',exact:true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab',{ name:'책 보기',exact:true })).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{ name:'그리드',exact:true })).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab',{ name:'책 보기',exact:true })).toHaveAttribute('aria-selected','true');
  const box = await tabs.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});
