import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const image = readFileSync('tests/fixtures/pet-dog.jpg');
const photos = Array.from({ length: 7 }, (_, i) => ({ name: `memory-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: image }));

test('diary preserves six photos, dates and text across reloads and detaches one photo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryEmpty h2')).toHaveCSS('font-family', /Noto Serif KR/);
  await expect(page.locator('.diaryEmpty .emptyState')).toHaveCount(0);
  await page.getByRole('button', { name: '첫 일기 쓰기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(page.viewportSize()!.width * .85);
  expect(bounds.height).toBeGreaterThan(page.viewportSize()!.height * .9);
  if (page.viewportSize()!.width >= 1000) {
    expect((await dialog.getByLabel('내용', { exact: true }).boundingBox())!.height).toBeGreaterThan(page.viewportSize()!.height * .5);
  }
  await dialog.getByLabel('제목', { exact: true }).fill('오래 기억할 하루');
  await dialog.getByLabel('내용', { exact: true }).fill('사진 여섯 장과 함께 남기는 이야기');
  await dialog.getByLabel('날짜', { exact: true }).fill('2026-09-24');
  await dialog.getByLabel('날씨', { exact: true }).selectOption('흐림');
  await dialog.getByLabel('일기 사진 파일').setInputFiles(photos);
  await expect(dialog.getByRole('alert')).toContainText('최대 6장');
  await expect(dialog.locator('.diaryAttachmentPrint')).toHaveCount(0);
  await dialog.getByLabel('일기 사진 파일').setInputFiles(photos.slice(0, 6));
  await expect(dialog.locator('.diaryAttachmentPrint')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: '사진 추가', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryCard')).toContainText('09.24');
  await expect(page.locator('.diaryCard')).toContainText('사진 6장');
  await expect(page.locator('.diaryMonthNav')).toContainText('2026년 9월');
  if (page.viewportSize()!.width >= 1100) {
    const card = await page.locator('.diaryCard').boundingBox();
    expect(card!.width).toBeGreaterThanOrEqual(390);
    expect(card!.height).toBeGreaterThanOrEqual(590);
  }
  await page.screenshot({ path: `test-results/diary-list-${test.info().project.name}.png` });
  await page.locator('.diaryOpen').click();
  await expect(dialog.getByLabel('내용', { exact: true })).toHaveValue('사진 여섯 장과 함께 남기는 이야기');
  await expect(dialog.getByLabel('날씨', { exact: true })).toHaveValue('흐림');
  await expect(dialog.locator('.diaryAttachmentPrint img')).toHaveCount(6);
  await expect.poll(() => dialog.locator('.diaryAttachmentPrint img').evaluateAll((imgs: HTMLImageElement[]) => imgs.every(img => img.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dialog.screenshot({ path: `test-results/diary-photos-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: '6번째 사진 삭제', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '사진 추가', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.diaryCard')).toContainText('사진 5장');
  await page.reload();
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryCard')).toHaveCount(1);
  await expect(page.locator('.diaryCard')).toContainText('사진 5장');
});

test('legacy text diary migrates when saved without changing its backup', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('warm-journal-diaries-v1', JSON.stringify([
    { id: 1, title: '예전 기록', date: '2026-09-20', body: '이전 내용', mood: '평온', weather: '맑음', album_id: null },
  ])));
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await page.locator('.diaryOpen').click();
  await page.getByLabel('내용', { exact: true }).fill('이어서 쓴 기록');
  await page.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryCard')).toContainText('이어서 쓴 기록');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('warm-journal-diaries-v1')!)[0].body)).toBe('이전 내용');
});

test('phone diary keeps its full paper frame and actions visible with long text and six photos', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Phone viewport and keyboard regression.');
  await page.goto('/');
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '첫 일기 쓰기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 일기' });
  await expect(dialog.locator('form')).toBeFocused();
  await dialog.getByLabel('제목', { exact: true }).fill('한 화면에 담은 기록');
  const body = Array.from({ length: 180 }, (_, i) => `${i + 1}번째 줄에 남겨 둔 오늘의 기억`).join('\n');
  const writing = dialog.getByLabel('내용', { exact: true });
  await writing.fill(body);
  await dialog.getByLabel('일기 사진 파일').setInputFiles(photos.slice(0, 6));
  await expect(dialog.locator('.diaryAttachmentPrint')).toHaveCount(6);
  for (const size of [{ width: 360, height: 640 }, { width: 393, height: 851 }, { width: 851, height: 393 }]) {
    await page.setViewportSize(size);
    const paper = (await dialog.boundingBox())!;
    expect(paper.y).toBeGreaterThanOrEqual(0);
    expect(paper.y + paper.height).toBeLessThanOrEqual(size.height);
    for (const control of [dialog.getByRole('button', { name: '닫기', exact: true }), dialog.getByRole('button', { name: '일기 저장', exact: true })]) {
      const box = (await control.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(paper.y);
      expect(box.y + box.height).toBeLessThanOrEqual(paper.y + paper.height);
    }
    expect(await writing.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await writing.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(writing).toHaveValue(body);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `preview-results/mobile-diary-${size.width}x${size.height}.png` });
  }
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => document.documentElement.style.setProperty('--app-viewport-height', '390px'));
  const save = (await dialog.getByRole('button', { name: '일기 저장', exact: true }).boundingBox())!;
  expect(save.y + save.height).toBeLessThanOrEqual(390);
  expect((await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'preview-results/mobile-diary-keyboard.png' });
  await dialog.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(dialog).toBeHidden();
});
