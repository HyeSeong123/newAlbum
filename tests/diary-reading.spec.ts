import { expect, test, type Page } from '@playwright/test';

async function createDiary(page: Page, mood: string) {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '첫 일기 쓰기', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '새 일기', exact: true });
  await editor.getByLabel('제목', { exact: true }).fill('오늘의 마음');
  await editor.getByLabel('내용', { exact: true }).fill('첫 줄의 이야기\n두 번째 줄의 기억');
  await editor.getByLabel('오늘의 기분', { exact: true }).selectOption(mood);
  await editor.getByRole('button', { name: '일기 저장', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.locator('.diaryOpen').click();
  return page.getByRole('dialog', { name: '일기 상세', exact: true });
}

for (const mood of ['배고픔', '보고싶음', '사랑함']) {
  test(`${mood} has an expression and survives editing and reload through a read-only detail`, async ({ page }) => {
    const detail = await createDiary(page, mood);
    await expect(detail.locator('input, textarea, select')).toHaveCount(0);
    await expect(detail.locator('.diaryReadBody')).toHaveText('첫 줄의 이야기\n두 번째 줄의 기억');
    await expect(detail.locator('.diaryMoodIcon')).toHaveAttribute('data-mood', mood);
    await detail.getByRole('button', { name: '일기 수정', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '일기 수정', exact: true });
    await expect(detail).toHaveCount(0);
    await expect(editor.getByLabel('오늘의 기분', { exact: true })).toHaveValue(mood);
    await expect(editor.locator('.diaryMoodIcon')).toHaveAttribute('data-mood', mood);
    await editor.getByLabel('제목', { exact: true }).fill('수정한 하루');
    await editor.getByRole('button', { name: '일기 저장', exact: true }).click();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: '수정한 하루', exact: true })).toBeVisible();
    await expect(detail.getByRole('status')).toHaveText('일기를 저장했습니다.');
    await page.reload();
    await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
    await page.locator('.diaryOpen').click();
    await expect(detail.locator('.diaryMoodIcon')).toHaveAttribute('data-mood', mood);
    await expect(detail.locator('.diaryReadBody')).toContainText('두 번째 줄의 기억');
  });
}

test('cancelled edits return to unchanged detail and closing detail returns to the list', async ({ page }) => {
  const detail = await createDiary(page, '평온');
  await detail.getByRole('button', { name: '일기 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '일기 수정', exact: true });
  await editor.getByLabel('내용', { exact: true }).fill('저장하지 않을 수정');
  page.once('dialog', dialog => dialog.dismiss());
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await expect(editor.getByLabel('내용', { exact: true })).toHaveValue('저장하지 않을 수정');
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await expect(detail.locator('.diaryReadBody')).toHaveText('첫 줄의 이야기\n두 번째 줄의 기억');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(page.locator('.diaryOpen')).toBeFocused();
});
