import { expect, test } from '@playwright/test';

test('approved spaced logo loads across views and narrow headers without losing legacy diary data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('warm-journal-diaries-v1', JSON.stringify([{ id: 'legacy-diary', date: '2026-10-01', title: '이름 변경 전 일기', body: '기존 기록을 그대로 읽습니다.', mood: '평온', weather: '맑음', photos: [] }]));
  });
  await page.goto('/');
  await expect(page).toHaveTitle('감자싹');
  const brand = page.locator('.brand');
  const logo = brand.getByRole('img', { name: '감자싹', exact: true });
  await expect(brand.getByRole('img', { name: '감자싹', exact: true })).toHaveCount(1);
  await expect(logo).toBeVisible();
  await brand.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map(image => image.decode())));
  expect(await brand.locator('img').evaluateAll((images: HTMLImageElement[]) => images.every(image => image.naturalWidth > 0))).toBe(true);
  await expect(logo).toHaveCSS('gap', '16px');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  const favicon = await page.request.get('/favicon.png');
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/png');
  for (const name of ['내 앨범', '일기장', '사진 기록']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(logo).toBeVisible();
    await expect(page.locator('body')).not.toContainText('그루터기');
    await expect(page.locator('body')).not.toContainText('오래담은');
    if (name === '일기장') {
      await expect(page.locator('.diaryCard')).toContainText('이름 변경 전 일기');
      await expect(page.locator('.diaryEyebrow')).toContainText('감자싹');
    }
  }
  const sizes = test.info().project.name === 'mobile' ? [393, 320] : [1440, 1080];
  for (const width of sizes) {
    await page.setViewportSize({ width, height: width <= 393 ? 851 : 960 });
    const logoBox = (await logo.boundingBox())!;
    const settingsBox = (await page.locator('.globalSettings').boundingBox())!;
    expect(logoBox.x + logoBox.width).toBeLessThanOrEqual(settingsBox.x);
    expect(logoBox.x + logoBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/branding-header-${width}.png` });
  }
});

test('new users meet Gomi and dismissing the guide survives a reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('brand-guide-initialized')) {
      localStorage.removeItem('geuruteogi.first-run-completed-v1');
      sessionStorage.setItem('brand-guide-initialized', 'true');
    }
  });
  await page.goto('/');
  const guide = page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요' });
  await expect(guide).toBeVisible();
  await guide.locator('.firstRunMascot img').evaluate((image: HTMLImageElement) => image.decode());
  await expect(guide.locator('.firstRunMascot img')).toHaveAttribute('src', '/characters/gomi/cynical.png');
  await expect(guide.locator('#firstRunDescription')).toContainText('…휴. 사진은 직접 골라.');
  await expect(guide).toContainText('감자싹은 원본 사진과 영상 파일을 삭제하거나 수정하지 않습니다.');
  await page.screenshot({ path: `test-results/branding-guide-${test.info().project.name}.png` });
  await guide.getByRole('button', { name: '나중에 하기' }).click();
  await page.reload();
  await expect(guide).toBeHidden();
});
