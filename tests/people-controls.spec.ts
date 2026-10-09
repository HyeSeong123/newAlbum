import { expect, test, type Locator, type Page } from '@playwright/test';

async function checkHeader(page: Page, header: Locator) {
  await expect(header).toBeVisible();
  const heading = await header.locator('.entityHeading').boundingBox();
  const actions = await header.locator('.entityActions').boundingBox();
  expect(heading!.height).toBeLessThan(100);
  expect(heading!.x + heading!.width).toBeLessThanOrEqual(actions!.x - 4);
  expect(Math.abs(heading!.y + heading!.height / 2 - actions!.y - actions!.height / 2)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const button of await header.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
}

async function checkMenu(page: Page, trigger: Locator) {
  await trigger.click();
  const menu = page.locator('.actionMenuPanel');
  await expect(menu).toBeVisible();
  const anchor = (await trigger.boundingBox())!;
  const bounds = (await menu.boundingBox())!;
  expect(Math.min(Math.abs(bounds.y - anchor.y - anchor.height - 6), Math.abs(anchor.y - bounds.y - bounds.height - 6))).toBeLessThan(2);
  expect(bounds.x).toBeGreaterThanOrEqual(9);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width - 9);
  expect(bounds.width).toBeLessThan(280);
  return menu;
}

test('people and pet controls stay aligned and anchored on narrow screens', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone geometry; desktop workflows are exercised by the people and pet suites.');
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const media = [1, 2].map(id => ({ id, file_path: `/photos/${id}.jpg`, file_type: 'image', taken_at: '2026-10-05', width: 800, height: 600, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => {
        if (command === 'list_media') return media;
        if (command === 'list_face_index') return {
          people: [{ id: 1, name: '아주 긴 이름을 가진 우리 가족' }, { id: 2, name: '혜성' }],
          faces: [1, 2].map(id => ({ id, person_id: id, media_id: id, thumbnail: '/favicon.svg', confirmed: true })), scanned: [1],
        };
        if (command === 'list_pets') return [{ id: 1, name: '아주 긴 이름을 가진 우리 보리', media_ids: [1, 2], cover_media_id: 1 }];
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  for (const { width, large } of [393, 360, 320].flatMap(width => [{ width, large: false }, { width, large: true }])) {
    await page.setViewportSize({ width, height: 851 });
    if ((await page.locator('main.app').getAttribute('class'))!.includes('largeLayout') !== large)
      await page.getByRole('button', { name: large ? '크게 보기' : '기본 크기', exact: true }).click();
    const peopleHeader = page.locator('.peopleView > .entityHeader');
    await checkHeader(page, peopleHeader);
    await page.getByRole('button', { name: '아주 긴 이름을 가진 우리 가족 1장', exact: true }).click();
    await checkHeader(page, peopleHeader);
    await expect(peopleHeader.getByText('사진 1장', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '사람 목록', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '새 사진에서 사람 찾기', exact: true })).toHaveCount(0);
    const directory = page.locator('.personDirectory');
    expect((await directory.boundingBox())!.width).toBeLessThanOrEqual(width);
    let menu = await checkMenu(page, peopleHeader.getByRole('button', { name: '사람 관리', exact: true }));
    await expect(menu.getByRole('button', { name: '사진 내보내기', exact: true })).toBeEnabled();
    await page.screenshot({ path: `preview-results/people-controls-person-${width}-${large ? 'large' : 'normal'}.png`, fullPage: true });
    await menu.getByRole('button', { name: '이름 수정', exact: true }).click();
    await expect(page.getByLabel('인물 이름')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByLabel('인물 이름').fill('취소할 이름');
    await page.locator('.personEditor').getByRole('button', { name: '취소', exact: true }).click();
    await expect(peopleHeader.getByRole('heading')).toHaveText('아주 긴 이름을 가진 우리 가족');
    await page.getByRole('button', { name: '사람 목록', exact: true }).click();
    await page.getByRole('tab', { name: '반려동물', exact: true }).click();
    const petHeader = page.locator('.petsView > .entityHeader');
    await checkHeader(page, petHeader);
    await page.getByRole('button', { name: '아주 긴 이름을 가진 우리 보리 2장', exact: true }).click();
    await checkHeader(page, petHeader);
    await expect(petHeader.getByText('사진 2장', { exact: true })).toBeVisible();
    menu = await checkMenu(page, petHeader.getByRole('button', { name: '반려동물 관리', exact: true }));
    await expect(menu.getByRole('button', { name: '인식 기준·결과 확인', exact: true })).toBeEnabled();
    await page.screenshot({ path: `preview-results/people-controls-pet-${width}-${large ? 'large' : 'normal'}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(petHeader.getByRole('button', { name: '반려동물 관리', exact: true })).toBeFocused();
    await petHeader.getByRole('button', { name: '이름·사진 수정', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '반려동물 편집' })).toBeVisible();
    await page.getByRole('dialog', { name: '반려동물 편집' }).getByTitle('닫기').click();
    await petHeader.getByRole('button', { name: '반려동물 목록', exact: true }).click();
    await page.getByRole('tab', { name: '사람', exact: true }).click();
  }
});
