import { expect, test } from '@playwright/test';

test('Home defers people UI and navigation remains usable while it loads', async ({ page }, info) => {
  const modules: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/src/features/people/PeopleWorkspace.tsx') modules.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.homeView')).toBeVisible();
  expect(modules).toHaveLength(0);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/features/people/PeopleWorkspace.tsx*', async route => { await held; await route.continue(); });
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '사람과 반려동물을 불러오는 중' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('people-loading.png') });
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await expect(page.locator('.homeView')).toBeVisible();
  release();
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('tab', { name: '인물', exact: true })).toBeVisible();
  await expect(page.locator('.peopleWorkspace')).toBeVisible();
  await expect(page.locator('.analysisActivityTrigger')).toHaveCount(0);
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await expect(page.locator('.petsView')).toBeVisible();
});

test('a failed people UI load leaves Home navigation and an explicit recovery action', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.homeView')).toBeVisible();
  await page.route('**/src/features/people/PeopleWorkspace.tsx*', route => route.abort('failed'));
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('화면을 불러오지 못했어요');
  await expect(page.getByRole('button', { name: '앱 다시 불러오기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await expect(page.locator('.homeView')).toBeVisible();
  await page.unroute('**/src/features/people/PeopleWorkspace.tsx*');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.getByRole('button', { name: '앱 다시 불러오기', exact: true }).click(),
  ]);
  await expect(page.locator('.homeView')).toBeVisible();
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('tab', { name: '인물', exact: true })).toBeVisible();
});
