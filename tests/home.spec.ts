import { expect, test } from '@playwright/test';
test.beforeEach(async ({page}) => { await page.addInitScript(()=>{Math.random=()=>.1;}); });

test('Gomi greets once per local day across Home navigation and app reloads', async ({ page }) => {
  await page.goto('/');
  const speech = page.locator('#homeMessage');
  await expect(speech).toHaveText('........누구....?');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('.navList').getByRole('button', { name: '홈', exact: true }).click();
  await expect(speech).not.toHaveText('........누구....?');
  await page.reload();
  await expect(speech).not.toHaveText('........누구....?');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gamjassak:gomi-greeting:')) localStorage.setItem(key,'2026-01-01');
    }
  });
  await page.reload();
  await expect(speech).toHaveText('........누구....?');
});

test('startup, every logo link, the first menu item and reload all lead to Home', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.navList');
  const home = page.getByRole('heading', { name: '홈', exact: true });
  await expect(home).toBeVisible();
  await expect(nav.getByRole('button').first()).toHaveAccessibleName('홈');
  await expect(nav.getByRole('button', { name: '홈', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.searchBox')).toHaveCount(0);
  for (const name of ['사진 기록', '내 앨범', '일기장', '추억', '사람과 반려동물', '설정']) {
    if (name === '설정') {
      const settings = page.getByRole('button', { name, exact: true });
      if (!await settings.isVisible()) await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
    } else await nav.getByRole('button', { name, exact: true }).click();
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
  await page.addInitScript(() => { Math.random = () => .1; });
  await page.goto('/');
  const mascot = page.getByRole('button', { name: '고미에게 말 걸기', exact: true });
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
  const third = await speech.innerText();
  await page.evaluate(() => { Math.random = () => 0.999999; });
  await mascot.press('Space');
  await expect(speech).not.toHaveText(third);
  await expect(speech).not.toHaveText('');
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
      const headerControl = page.locator('.globalSettings:visible, .headerMenu .actionMenuTrigger:visible');
      await expect(headerControl).toHaveCount(1);
      await expect(headerControl).toBeInViewport({ ratio: 1 });
      const control = (await headerControl.boundingBox())!;
      expect(logo.x + logo.width).toBeLessThanOrEqual(control.x);
      const nav = (await page.locator('.navList').boundingBox())!;
      if (width > 1000) expect(logo.x + logo.width).toBeLessThanOrEqual(nav.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByRole('button', { name: '고미에게 말 걸기' })).toBeVisible();
      await page.screenshot({ path: `preview-results/home-${width}-${large ? 'large' : 'default'}.png`, fullPage: true, animations: 'disabled' });
    }
  }
});


test('Home companion actions expand, respond, remember locally and never award affection', async ({ page }) => {
  await page.goto('/');
  const speech = page.locator('#homeMessage');
  const toggle = page.getByRole('button', { name: '함께하기', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: '친구와 함께하기' })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const actions = page.getByRole('group', { name: '친구와 함께하기' });
  await expect(actions.getByRole('button')).toHaveCount(5);

  await actions.getByRole('button', { name: '함께 산책' }).click();
  await expect(speech).toContainText('나가기 싫어');
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gamjassak:companion:v1:gomi') || 'null'));
  expect(saved?.history?.at(-1)?.action).toBe('walk');
  expect(saved?.mood).toBe('curious');

  await actions.getByRole('button', { name: '간식 주기' }).click();
  await expect(speech).toContainText('뭐야');
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gamjassak:companion:v1:gomi') || 'null'));
  expect(saved.history.map((entry: { action: string }) => entry.action)).toEqual(['walk', 'treat']);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(actions).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
});


test('Android location ribbon opens device and app settings and keeps the Home usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 17; Pixel 7)' });
    (window as any).setupCommands = [];
    (window as any).__TAURI_INTERNALS__ = {
      convertFileSrc: () => '/favicon.png',
      invoke: async (command: string, args: unknown) => {
        if (command === 'check_android_location_setup') return { locationEnabled: false, photoLocationGranted: false };
        if (command === 'open_android_location_settings') { (window as any).setupCommands.push(args); return null; }
        return [];
      },
    };
  });
  await page.goto('/');
  const ribbon = page.getByRole('complementary', { name: '촬영 위치 설정 알림' });
  await expect(ribbon).toBeVisible();
  await expect(ribbon).toContainText('휴대폰 위치 기능이 꺼져 있어요');
  await ribbon.getByRole('button', { name: '설정 안내' }).click();
  await ribbon.getByRole('button', { name: '휴대폰 위치 설정 열기' }).click();
  await ribbon.getByRole('button', { name: '감자싹 앱 권한 설정 열기' }).click();
  expect(await page.evaluate(() => (window as any).setupCommands)).toEqual([{ kind: 'device' }, { kind: 'app' }]);
  await ribbon.getByRole('button', { name: '카메라 위치 태그 확인했어요' }).click();
  await expect(ribbon).toBeVisible();
  await ribbon.getByRole('button', { name: '이번에는 알림 닫기' }).click();
  await expect(ribbon).toHaveCount(0);
  await expect(page.locator('.homeMascot')).toBeVisible();
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
});

test('Android location ribbon disappears after resolved settings and confirmed camera tag', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 17; Pixel 7)' });
    localStorage.setItem('gamjassak:camera-location-confirmed:v1', 'true');
    (window as any).__TAURI_INTERNALS__ = {
      convertFileSrc: () => '/favicon.png',
      invoke: async (command: string) => command === 'check_android_location_setup'
        ? { locationEnabled: true, photoLocationGranted: true } : [],
    };
  });
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: '촬영 위치 설정 알림' })).toHaveCount(0);
  await expect(page.locator('.homeMascot')).toBeVisible();
});

test('location ribbon reports native settings failure and a subsequent successful recheck', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 17; Pixel 7)' });
    (window as any).locationTry = 0;
    (window as any).__TAURI_INTERNALS__ = {
      convertFileSrc: () => '/favicon.png',
      invoke: async (command: string) => {
        if (command === 'check_android_location_setup') {
          if (!(window as any).locationTry++) throw new Error('Native bridge unavailable');
          return { locationEnabled: true, photoLocationGranted: true };
        }
        if (command === 'open_android_location_settings') throw new Error('Cannot open native settings');
        return [];
      },
    };
  });
  await page.goto('/');
  const ribbon = page.getByRole('complementary', { name: '촬영 위치 설정 알림' });
  await expect(ribbon).toHaveAttribute('data-check-state', 'failed');
  await expect(ribbon.getByRole('alert')).toContainText('자동으로 읽지 못했어요');
  await ribbon.getByRole('button', { name: '휴대폰 위치 설정 열기' }).click();
  await expect(ribbon.getByRole('alert')).toContainText('설정 앱에서');
  await ribbon.getByRole('button', { name: '감자싹 앱 권한 설정 열기' }).click();
  await expect(ribbon.getByRole('alert')).toContainText('애플리케이션');
  await ribbon.getByRole('button', { name: '설정 다시 확인' }).click();
  await expect(ribbon).toHaveAttribute('data-check-state', 'ready');
  await expect(ribbon.getByRole('status')).toContainText('접근을 확인했어요');
  await expect(ribbon).toContainText('카메라 위치 태그를 확인해 주세요');
  await expect(page.locator('.homeMascot')).toBeVisible();
});
