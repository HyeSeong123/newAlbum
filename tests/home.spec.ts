import { expect, test } from '@playwright/test';

test('startup, every logo link, the first menu item and reload all lead to Home', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.navList');
  const home = page.getByRole('heading', { name: '홈', exact: true });
  await expect(home).toBeVisible();
  await expect(nav.getByRole('button').first()).toHaveAccessibleName('홈');
  await expect(nav.getByRole('button', { name: '홈', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.searchBox')).toHaveCount(0);
  for (const name of ['사진 기록', '내 앨범', '일기장', '추억', '사람과 반려동물', '설정']) {
    const menu = name === '설정' ? page.locator('.globalSettings') : nav.getByRole('button', { name, exact: true });
    await menu.click();
    await expect(home).toBeHidden();
    await page.getByRole('button', { name: '감자싹 홈으로 이동', exact: true }).click();
    await expect(home).toBeVisible();
    await expect(nav.getByRole('button', { name: '홈', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await nav.getByRole('button', { name: '사진 기록', exact: true }).click();
  await nav.getByRole('button', { name: '홈', exact: true }).click();
  await expect(home).toBeVisible();
  await nav.getByRole('button', { name: '일기장', exact: true }).click();
  await page.reload();
  await expect(home).toBeVisible();
});

test('the mascot chooses different messages and supports Enter and Space without network requests', async ({ page }) => {
  await page.goto('/');
  const mascot = page.getByRole('button', { name: '감자싹에게 말 걸기', exact: true });
  const speech = page.getByRole('status');
  await mascot.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  await expect(speech).toHaveAttribute('aria-live', 'polite');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.evaluate(() => { Math.random = () => 0; });
  const initial = await speech.innerText();
  await mascot.click();
  await expect(speech).not.toHaveText(initial);
  const second = await speech.innerText();
  await mascot.press('Enter');
  await expect(speech).not.toHaveText(second);
  await page.evaluate(() => { Math.random = () => 0.999999; });
  await mascot.press('Space');
  await expect(speech).toHaveText('새싹에게 톡 말 걸면 하루 한 번 더 친해질 수 있어!');
  const last = await speech.innerText();
  await mascot.click();
  await expect(speech).not.toHaveText(last);
  expect(requests.filter(url => !url.startsWith('http://127.0.0.1:5173/'))).toEqual([]);
});

test('Home shortcuts show existing counts and open the matching records', async ({ page }) => {
  await page.addInitScript(() => {
    const diaries = [{ id: 1, date: '2026-10-01', title: '소중한 하루', body: '그대로 남아 있는 이야기', mood: '평온', weather: '맑음', album_id: null, photos: [] }];
    const media = [{ id: 1, file_path: 'C:/home-photo.jpg', file_type: 'image', taken_at: '2026-10-01', width: 640, height: 480, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.png',
      invoke: async (command: string) => command === 'list_media' ? media : command === 'list_diary' ? diaries : command === 'list_albums' ? [{ id: 1, title: '우리의 가을', description: '', cover_color: '#D8DDCB', created_at: '2026-10-01', items: media }] : [],
    } });
  });
  await page.goto('/');
  const shortcuts = page.getByRole('navigation', { name: '기록 바로가기' });
  await expect(shortcuts.getByRole('button', { name: '사진 기록 열기' })).toContainText('1개의 기록');
  await expect(shortcuts.getByRole('button', { name: '내 앨범 열기' })).toContainText('1개의 앨범');
  await expect(shortcuts.getByRole('button', { name: '일기장 열기' })).toContainText('1편의 일기');
  for (const name of ['사진 기록', '내 앨범', '일기장']) {
    await shortcuts.getByRole('button', { name: `${name} 열기`, exact: true }).click();
    await expect(page.getByRole('heading', { name: name === '일기장' ? '나의 일기장' : name, exact: true })).toBeVisible();
    if (name === '일기장') await expect(page.locator('.diaryCard')).toContainText('소중한 하루');
    await page.locator('.navList').getByRole('button', { name: '홈', exact: true }).click();
  }
});

test('Home and the 16px logo gap fit narrow windows and larger text', async ({ page }) => {
  await page.goto('/');
  const widths = test.info().project.name === 'mobile' ? [393, 320] : [1440, 1080, 1024, 1001];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    for (const large of [false, true]) {
      const toggle = page.locator('.layoutToggle');
      if ((await toggle.getAttribute('aria-pressed') === 'true') !== large) await toggle.click();
      await expect(page.locator('.brandLogo')).toHaveCSS('gap', '16px');
      const character = (await page.locator('.brandLogoCharacter').boundingBox())!;
      const lettering = (await page.locator('.brandLogoLettering').boundingBox())!;
      expect(lettering.x - character.x - character.width).toBeCloseTo(16, 1);
      const logo = (await page.locator('.brand').boundingBox())!;
      const settings = (await page.locator('.globalSettings').boundingBox())!;
      expect(logo.x + logo.width).toBeLessThanOrEqual(settings.x);
      const nav = (await page.locator('.navList').boundingBox())!;
      if (width > 1000) expect(logo.x + logo.width).toBeLessThanOrEqual(nav.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByRole('button', { name: '감자싹에게 말 걸기' })).toBeVisible();
      await page.screenshot({ path: `test-results/home-${width}-${large ? 'large' : 'default'}.png`, fullPage: true });
    }
  }
});
