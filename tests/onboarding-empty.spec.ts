import { expect, test } from '@playwright/test';

test('first run explains the workflow, opens the existing file picker, and stays dismissed', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('first-run-test-initialized')) {
      localStorage.removeItem('geuruteogi.first-run-completed-v1');
      sessionStorage.setItem('first-run-test-initialized', 'true');
    }
  });
  await page.goto('/');
  const guide = page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('원본 사진과 영상 파일을 삭제하거나 수정하지 않습니다.');
  const chooser = page.waitForEvent('filechooser');
  await guide.getByRole('button', { name: '사진 가져오기' }).click();
  await (await chooser).setFiles({ name: 'first.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await expect(guide).toBeHidden();
  await expect(page.getByText('사진과 영상 1개를 가져왔습니다.')).toBeVisible();
  await page.reload();
  await expect(guide).toBeHidden();
});

test('later and existing diary data suppress the first run guide', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('first-run-test-initialized')) {
      localStorage.removeItem('geuruteogi.first-run-completed-v1');
      sessionStorage.setItem('first-run-test-initialized', 'true');
    }
  });
  await page.goto('/');
  await page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' }).getByRole('button', { name: '나중에 하기' }).click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' })).toBeHidden();
  await page.evaluate(() => {
    localStorage.removeItem('geuruteogi.first-run-completed-v1');
    localStorage.setItem('warm-journal-diaries-v1', JSON.stringify([{ id: 1, date: '2026-09-28', title: '첫 일기', body: '', mood: '평온', weather: '맑음', album_id: null }]));
  });
  await page.reload();
  await expect(page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('geuruteogi.first-run-completed-v1'))).toBe('true');
});

test('empty screens explain the next step and open their existing flows', async ({ page }) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await expect(page.getByText('아직 사진 기록이 없습니다.')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '사진 가져오기', exact: true }).click();
  await (await chooser).setFiles([]);
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  const albumChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '첫 앨범 만들기' }).click();
  await (await albumChooser).setFiles({ name: 'album-first.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await expect(page.getByRole('button', { name: '선택 끝내기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '현재 결과 전체 선택 (1개)', exact: true }).click();
  await page.getByRole('button', { name: '앨범 만들기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '앨범 만들기' })).toBeVisible();
  await page.getByRole('dialog', { name: '앨범 만들기' }).getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '첫 일기 쓰기' }).click();
  await expect(page.getByRole('dialog', { name: '새 일기' })).toBeVisible();
  await page.getByRole('dialog', { name: '새 일기' }).getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByText('아직 등록된 사람이 없습니다.')).toBeVisible();
});

test('a map without GPS offers direct region assignment while keeping the photo', async ({ page }) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'without-gps.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await page.getByRole('button', { name: '추억', exact: true }).click();
  await page.getByRole('group', { name: '추억 보기' }).getByRole('button', { name: '추억 지도' }).click();
  await expect(page.getByText('아직 지도에 표시할 기록이 없습니다.')).toBeVisible();
  await expect(page.getByText('위치가 없는 사진은 직접 지역을 지정할 수 있습니다.')).toBeVisible();
  await page.getByRole('button', { name: '지역 미분류 사진 보기' }).click();
  await expect(page.locator('.memoryMapGallery')).toContainText('without-gps.jpg');
});
