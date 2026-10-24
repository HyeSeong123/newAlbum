import { expect, test } from '@playwright/test';
import { prepareHelp, openHelp, helpDialog, toStep } from './fixtures/helpSpotlight';

async function scrollAndSettle(page: import('@playwright/test').Page, y: number) {
  await page.evaluate(async value => {
    window.scrollTo(0, value);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, y);
}

test('home help stays in the bottom corner while ordinary shortcut cards scroll past', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await prepareHelp(page);
  const trigger = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  const positions = [];
  for (const y of [0, 200, 500, 900, 100]) {
    await scrollAndSettle(page, y);
    const box = (await trigger.boundingBox())!;
    positions.push(box.y);
    await page.screenshot({ path: `preview-results/spotlight/${process.env.HELP_POLISH_STAGE ?? 'after'}-home-scroll-${test.info().project.name}-${y}.png` });
    expect(390 - box.x - box.width).toBeLessThan(32);
    expect(780 - box.y - box.height).toBeLessThan(80);
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(2);
  await trigger.click();
  await toStep(page, '사진 기록 열기');
  await page.screenshot({ path: `preview-results/spotlight/${process.env.HELP_POLISH_STAGE ?? 'after'}-home-guide-${test.info().project.name}.png` });
  await helpDialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await helpDialog(page).getByRole('button', { name: '이전', exact: true }).click();
  await expect(helpDialog(page).getByRole('heading', { name: '사진 기록 열기', exact: true })).toBeVisible();
  await helpDialog(page).getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(helpDialog(page).getByRole('heading', { name: '사진 기록 열기', exact: true })).toBeHidden();
  await helpDialog(page).getByRole('button', { name: '도움말 종료', exact: true }).click();
  await expect(helpDialog(page)).toBeHidden();
});

test('home help stays fixed while restored analysis remains idle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await prepareHelp(page, 'gomi', 0, 90, false, true);
  await expect(page.locator('.analysisActivityTrigger')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  const positions = [];
  for (const y of [0, 200, 500, 900, 100]) {
    await scrollAndSettle(page, y);
    const b = (await trigger.boundingBox())!;
    positions.push(b.y);
    expect(b.y + b.height).toBeLessThanOrEqual(780);
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(2);
  await trigger.click();
  await expect(helpDialog(page)).toBeVisible();
});

test('photo selection keeps help above its pinned commands as the list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await prepareHelp(page, 'gomi', 0, 90);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.libraryView .selectionToggle').click();
  await page.locator('.mediaTile').first().click();
  const dock = page.locator('.libraryView .entitySelectionBar');
  await expect(dock).toBeVisible();
  const positions = [];
  for (const y of [0, 250, 600, 50]) {
    await scrollAndSettle(page, y);
    const a = (await dock.boundingBox())!, b = (await page.getByRole('button', { name: '현재 화면 도움말', exact: true }).boundingBox())!;
    positions.push(b.y);
    expect(b.y + b.height).toBeLessThanOrEqual(a.y - 8);
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(2);
  await dock.getByRole('button', { name: '선택 취소', exact: true }).click();
  await expect(dock).toBeHidden();
});

test('baseline current help capture', async ({ page }) => {
  test.skip(process.env.HELP_BASELINE !== '1');
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.screenshot({ path: `preview-results/spotlight/before-people-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '사용 방법 도움말 열기' }).click();
  await page.screenshot({ path: `preview-results/spotlight/before-help-${test.info().project.name}.png` });
});

test('help points to live buttons without activating tabs and restores focus', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.screenshot({ path: `preview-results/spotlight/after-people-${test.info().project.name}.png`, fullPage: true });
  await openHelp(page);
  const guide = helpDialog(page);
  await page.screenshot({ path: `preview-results/spotlight/after-help-${test.info().project.name}.png` });
  await expect(guide.getByRole('heading', { name: '인물', exact: true })).toBeVisible();
  await expect(guide.getByRole('status')).toContainText('1 /');
  await guide.getByRole('button', { name: '다음', exact: true }).click();
  await expect(guide.getByRole('heading', { name: '반려동물', exact: true })).toBeVisible();
  const target = page.locator('[data-help-highlighted]');
  await target.click({ force: true });
  await expect(guide).toBeVisible();
  // Underlying state stays on People, even when the bright Pets tab is touched.
  expect(await page.locator('#people-tab-0').getAttribute('aria-selected')).toBe('true');
  await guide.getByRole('button', { name: '도움말 종료', exact: true }).click();
  await expect(page.getByRole('button', { name: '현재 화면 도움말', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: '인물', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await openHelp(page);
  await toStep(page, '반려동물 추가');
  await expect(guide.locator('.characterVisual')).toBeInViewport();
  expect(await guide.locator('.helpGuideContent').evaluate(e => e.clientHeight)).toBeGreaterThan(70);
  await page.screenshot({ path: `preview-results/spotlight/after-pets-${test.info().project.name}.png` });
});

test('selection help preserves scroll and selected photos and never executes deletion', async ({ page }) => {
  await prepareHelp(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.getByRole('button', { name: '선택', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await page.evaluate(() => window.scrollTo(0, 100));
  const scroll = await page.evaluate(() => window.scrollY);
  const selected = await page.locator('.entitySelectionSummary strong').innerText();
  await openHelp(page);
  await toStep(page, '삭제');
  await page.locator('[data-help-highlighted]').click({ force: true });
  expect(await page.evaluate(() => (window as any).spotlightCalls.filter((c: any) => c.command === 'delete_registered_media').length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(helpDialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
  await expect(page.locator('.entitySelectionSummary strong')).toHaveText(selected);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.locator('.entitySelectionSummary strong')).toHaveText(selected);
});

test('top dialog help excludes the underlying page and Back only closes help', async ({ page, isMobile }) => {
  await prepareHelp(page, 'potato', 60);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '미확인 인물 다시 확인', exact: true }).click();
  const review = page.getByRole('dialog', { name: '미확인 인물 다시 확인', exact: true });
  await review.getByRole('checkbox', { name: '미확인 얼굴 1 선택', exact: true }).check();
  await openHelp(page);
  await expect(helpDialog(page).locator('.characterHelpName')).toHaveText('우리 감자');
  await expect(page.locator('[data-help-highlighted]')).toHaveAttribute('data-help-scope', 'dialog');
  await page.screenshot({ path: `preview-results/spotlight/after-modal-${test.info().project.name}.png` });
  if (isMobile) expect(await page.evaluate(() => window.__gamjassakBack?.())).toBe(true);
  else await page.keyboard.press('Escape');
  await expect(helpDialog(page)).toBeHidden();
  await expect(review).toBeVisible();
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 1 선택', exact: true })).toBeChecked();
});

test('small viewport, scrolling and resize keep guide clear of target', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await openHelp(page);
  for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 780 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-help-highlighted]')).toBeInViewport();
    await expect.poll(async () => {
      const box = await page.locator('.helpGuideCard').boundingBox();
      const target = await page.locator('[data-help-highlighted]').boundingBox();
      if (!box || !target) return false;
      const intersects = box.x < target.x + target.width && box.x + box.width > target.x && box.y < target.y + target.height && box.y + box.height > target.y;
      return !intersects && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
    }).toBe(true);
    await page.screenshot({ path: `preview-results/spotlight/after-${viewport.width}-${test.info().project.name}.png` });
  }
});

test('opened action menu stays open and its help contains only menu actions', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 관리', exact: true }).click();
  const menu = page.locator('.actionMenuPanel');
  await expect(menu).toBeVisible();
  await openHelp(page);
  expect(await page.locator('[data-help-highlighted]').evaluate(e => Boolean(e.closest('.actionMenuPanel')))).toBe(true);
  await expect(helpDialog(page).getByRole('heading', { name: '찾은 얼굴 모두 보기', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '찾은 얼굴 모두 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '찾은 얼굴', exact: true })).toBeVisible();
});

test('help is available across major screens and fields retain unsaved input', async ({ page }) => {
  await prepareHelp(page);
  for (const name of ['사진 기록', '내 앨범', '일기장', '추억', '새싹 도감', '사람과 반려동물']) {
    await page.locator('.navList').getByRole('button', { name, exact: true }).click();
    await openHelp(page);
    await expect(helpDialog(page)).toBeVisible();
    await expect(page.locator('[data-help-highlighted]')).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
  await page.getByRole('button', { name: '일기 쓰기', exact: true }).click();
  const diary = page.getByRole('dialog', { name: '새 일기', exact: true });
  await diary.getByRole('textbox', { name: '제목', exact: true }).fill('아직 저장하지 않은 제목');
  await openHelp(page);
  await toStep(page, '제목');
  await page.getByRole('dialog', { name: '버튼 도움말' }).getByRole('button', { name: '도움말 종료' }).click();
  await expect(diary.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('아직 저장하지 않은 제목');
  page.once('dialog', dialog => dialog.accept());
  await diary.getByRole('button', { name: '취소', exact: true }).click();
  await expect(diary).toBeHidden();
  if (!await page.getByRole('button', { name: '설정', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
    await page.locator('.actionMenuPanel').getByRole('button', { name: '설정', exact: true }).click();
  } else await page.getByRole('button', { name: '설정', exact: true }).click();
  await openHelp(page);
  await expect(helpDialog(page).getByRole('heading', { name: '모두 비우기', exact: true })).toBeVisible();
});

test('disabled and hidden controls are omitted and a disappearing target is skipped', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '인물 추가', exact: true }).click();
  await openHelp(page);
  const titles: string[] = [];
  for (let i = 0; i < 20; i++) {
    const target = page.locator('[data-help-highlighted]');
    expect(await target.evaluate(e => e.matches(':disabled, [aria-disabled="true"]') || Boolean(e.closest('[hidden]')))).toBe(false);
    titles.push(await helpDialog(page).locator('h3').innerText());
    if (await helpDialog(page).getByRole('button', { name: '마치기', exact: true }).isVisible()) break;
    await helpDialog(page).getByRole('button', { name: '다음', exact: true }).click();
  }
  expect(titles).not.toContain('사진 저장');
  expect(titles).not.toContain('반려동물 추가');
  await page.locator('[data-help-highlighted]').evaluate(e => e.remove());
  await expect(helpDialog(page)).toBeVisible();
  await expect(page.locator('[data-help-highlighted]')).toHaveCount(1);
});

test('empty settings keeps the entry point without inventing disabled actions', async ({ page }) => {
  await prepareHelp(page, 'gomi', 0, 0);
  if (!await page.getByRole('button', { name: '설정', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
    await page.locator('.actionMenuPanel').getByRole('button', { name: '설정', exact: true }).click();
  } else await page.getByRole('button', { name: '설정', exact: true }).click();
  await openHelp(page);
  await expect(helpDialog(page).getByRole('heading', { name: '현재 안내할 작업이 없어요', exact: true })).toBeVisible();
  await expect(page.locator('[data-help-highlighted]')).toHaveCount(0);
  await helpDialog(page).getByRole('button', { name: '마치기', exact: true }).click();
  await expect(helpDialog(page)).toBeHidden();
});

for (const affection of [0, 20, 30, 60, 90]) test(`live character help resolves affection ${affection} without writes`, async ({ page }) => {
  await prepareHelp(page, 'potato', affection);
  await openHelp(page);
  await expect(helpDialog(page).locator('.helpVoice')).toHaveAttribute('data-affinity', String([0, 20, 30, 60, 90].indexOf(affection)));
  await expect(helpDialog(page).locator('.characterHelpName')).toHaveText('우리 감자');
  await expect(helpDialog(page).locator('.characterVisual')).toHaveAttribute('data-stage', '1');
  await expect(helpDialog(page).locator('.helpGuideContent')).toBeVisible();
  expect(await page.evaluate(() => (window as any).spotlightCalls.filter((c: any) => /interact_character/.test(c.command)).length)).toBe(0);
});

test('offline help has trapped focus, reduced motion and no affinity write', async ({ page, context }) => {
  await prepareHelp(page, 'gomi', 90);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await context.setOffline(true);
  await openHelp(page);
  const guide = helpDialog(page);
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-reduced-motion', 'true');
  await expect.poll(() => guide.locator('img').evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await guide.evaluate(e => e.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).spotlightCalls.filter((c: any) => /interact_character|delete_|save_/.test(c.command)).length)).toBe(0);
});

test('photo help blocks parent arrow shortcuts, then the real title save and next photo still work', async ({ page }) => {
  await prepareHelp(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const field = detail.getByRole('textbox', { name: '사진 제목', exact: true });
  const before = await field.inputValue();
  await openHelp(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  expect(await field.inputValue()).toBe(before);
  await toStep(page, '즐겨찾기');
  const next = helpDialog(page).getByRole('button', { name: '다음', exact: true });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(helpDialog(page).locator('h3')).not.toHaveText('즐겨찾기');
  await page.keyboard.press('Escape');
  await field.fill('도움말 뒤에 저장한 제목');
  await detail.getByRole('button', { name: '사진 제목 저장', exact: true }).click();
  await expect(field).toHaveValue('도움말 뒤에 저장한 제목');
  expect(await page.evaluate(() => (window as any).spotlightCalls.filter((c: any) => c.command === 'update_media_title').length)).toBe(1);
  await page.keyboard.press('Tab');
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(field).not.toHaveValue('도움말 뒤에 저장한 제목');
});

test('manual pet region help preserves body, direction and name-connection instructions', async ({ page }) => {
  await prepareHelp(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  await detail.getByRole('button', { name: '반려동물 직접 추가', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '반려동물 직접 추가', exact: true });
  await openHelp(page);
  await toStep(page, '촬영 방향');
  await expect(helpDialog(page).locator('#helpInstruction')).toContainText('뒷모습');
  await toStep(page, '영역 추가');
  await expect(helpDialog(page).locator('#helpInstruction')).toContainText('이 단계에서는 이름을 연결하지');
  await expect(helpDialog(page).locator('#helpInstruction')).toContainText('몸 전체');
  await page.screenshot({ path: `preview-results/spotlight/after-pet-region-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await expect(detail).toBeVisible();
});


test('keyboard users can reach help within a writing dialog and return to their draft', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '일기장', exact: true }).first().click();
  await page.getByRole('button', { name: /^(일기 쓰기|첫 일기 쓰기)$/ }).first().click();
  const editor = page.getByRole('dialog', { name: '새 일기', exact: true });
  await editor.getByLabel('제목', { exact: true }).fill('도움말 전 작성 중');
  const trigger = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  let reached = false;
  for (let i = 0; i < 26; i++) {
    await page.keyboard.press('Tab');
    if (await trigger.evaluate(e => e === document.activeElement)) { reached = true; break; }
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  await expect(helpDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(editor.getByLabel('제목', { exact: true })).toHaveValue('도움말 전 작성 중');
  await page.keyboard.press('Tab');
  expect(await editor.evaluate(e => e.contains(document.activeElement))).toBe(true);
});

test('discovery popup stays in place during its button help without dismissing the event', async ({ page }) => {
  await prepareHelp(page, 'gomi', 0, 12, true);
  const discovery = page.getByRole('dialog', { name: '새로운 새싹을 발견했어요!', exact: true });
  await expect(discovery).toBeVisible();
  await openHelp(page);
  await expect(page.locator('[data-help-highlighted]')).toHaveText('만나보기');
  await toStep(page, '나중에 보기');
  await page.keyboard.press('Escape');
  await expect(discovery).toBeVisible();
  expect(await page.evaluate(() => (window as any).spotlightCalls.filter((c: any) => c.command === 'dismiss_character_event').length)).toBe(0);
  await discovery.getByRole('button', { name: '나중에 보기', exact: true }).click();
  await expect(discovery).toBeHidden();
});

test('pet photo selection explains toggling without person-face restrictions', async ({ page }) => {
  await prepareHelp(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '반려동물 추가', exact: true }).click();
  await openHelp(page);
  await toStep(page, '사진 선택');
  await expect(helpDialog(page).locator('#helpInstruction')).toContainText('선택하거나 해제');
  await expect(helpDialog(page).locator('#helpInstruction')).not.toContainText('얼굴');
});

test('photo dialog help ignores covered background controls and leaves close reachable', async ({ page }) => {
  await prepareHelp(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  // Background photo actions can occupy the same coordinates, but are covered
  // by the current dialog and must not push help over that dialog's close.
  await page.locator('.workspace').evaluate(e => {
    const control = document.createElement('button');
    control.textContent = '배경 사진 작업';
    control.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1';
    e.append(control);
  });
  await page.setViewportSize({ width: 412, height: 824 });
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  const close = detail.getByTitle('닫기', { exact: true });
  await expect.poll(async () => {
    const a = await close.boundingBox(), b = await page.getByRole('button', { name: '현재 화면 도움말', exact: true }).boundingBox();
    return a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }).toBe(true);
  await close.click();
  await expect(detail).toBeHidden();
});

test('zoomed photo canvas never pushes help over the close action', async ({ page }) => {
  await prepareHelp(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await page.getByTitle('확대 보기', { exact: true }).click();
  const zoom = page.getByRole('dialog', { name: '사진 확대 보기', exact: true });
  await zoom.getByRole('slider', { name: '확대 배율', exact: true }).fill('2.5');
  const close = zoom.getByTitle('확대 보기 닫기', { exact: true });
  await expect.poll(async () => {
    const a = await close.boundingBox(), b = await page.getByRole('button', { name: '현재 화면 도움말', exact: true }).boundingBox();
    return a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }).toBe(true);
  await close.click();
  await expect(zoom).toBeHidden();
  await expect(page.getByRole('dialog', { name: '사진 상세', exact: true })).toBeVisible();
});

test('help reveals a control clipped inside a scrolled editor and restores the draft scroll',async({page})=>{
  await page.setViewportSize({width:393,height:800});
  await prepareHelp(page,'gomi',30,90);
  await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('button',{name:'인물 추가',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'인물 추가',exact:true});
  const input=editor.getByLabel('등록할 이름');
  await input.fill('스크롤 뒤에도 남길 이름');
  const body=editor.locator('.entityEditBody');
  // The target is above the body's clip edge, while still inside the window.
  const before=await body.evaluate(element=>{
    element.style.maxHeight='240px';
    const field=element.querySelector('input')!;
    const bounds=field.getBoundingClientRect(),pane=element.getBoundingClientRect();
    element.scrollTop+=bounds.bottom-pane.top+12;
    return element.scrollTop;
  });
  expect(before).toBeGreaterThan(0);
  const clipped=await input.boundingBox(),pane=await body.boundingBox();
  expect(clipped!.y).toBeGreaterThan(0);
  expect(clipped!.y+clipped!.height).toBeLessThan(pane!.y);
  await openHelp(page);
  await toStep(page,'등록할 이름');
  await expect.poll(async()=>{
    const field=await input.boundingBox(),area=await body.boundingBox(),ring=await page.locator('.helpSpotlight').boundingBox();
    return Boolean(field&&area&&ring&&field.y>=area.y&&field.y+field.height<=area.y+area.height
      &&Math.abs(ring.x-(field.x-6))<2&&Math.abs(ring.y-(field.y-6))<2);
  }).toBe(true);
  await page.screenshot({path:`preview-results/spotlight/scrolled-editor-${test.info().project.name}.png`});
  await page.keyboard.press('Escape');
  await expect.poll(()=>body.evaluate(element=>element.scrollTop)).toBe(before);
  await expect(input).toHaveValue('스크롤 뒤에도 남길 이름');
  expect(await page.evaluate(()=>(window as any).spotlightCalls.filter((call:any)=>/save_manual_person_photos|rename_face_person/.test(call.command)).length)).toBe(0);
});

test('a horizontally clipped action is revealed before highlighting and its scroll is restored',async({page})=>{
  await prepareHelp(page);
  await page.locator('.workspace').evaluate(root=>{
    const rail=document.createElement('div');rail.id='help-scroll-rail';
    rail.style.cssText='position:fixed;left:40px;top:240px;width:220px;height:64px;overflow-x:auto;white-space:nowrap;z-index:5;';
    const strip=document.createElement('div');strip.style.cssText='width:900px;';
    const button=document.createElement('button');button.textContent='사진 제목 저장';
    button.style.cssText='margin-left:180px;width:140px;height:44px;';
    strip.append(button);rail.append(strip);root.append(rail);rail.scrollLeft=40;
  });
  const rail=page.locator('#help-scroll-rail');
  const before=await rail.evaluate(element=>element.scrollLeft);
  await openHelp(page);await toStep(page,'사진 제목 저장');
  await expect.poll(()=>rail.evaluate(element=>{
    const control=element.querySelector('button')!.getBoundingClientRect(),area=element.getBoundingClientRect();
    return control.left>=area.left&&control.right<=area.right;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(()=>rail.evaluate(element=>element.scrollLeft)).toBe(before);
});

test('help dialogue varies on another visit but is stable through resize and previous',async({page})=>{
  await prepareHelp(page,'gomi',60);
  await openHelp(page);
  const guide=helpDialog(page);
  const voice=guide.locator('.helpVoice');
  const first=await voice.innerText(),instruction=await guide.locator('#helpInstruction').innerText();
  await page.setViewportSize({width:320,height:700});
  await expect(voice).toHaveText(first);
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.locator('.helpGuideCard')).toBeVisible();
  await expect(voice).not.toHaveText(first);
  await guide.getByRole('button',{name:'이전',exact:true}).click();
  await expect(voice).toHaveText(first);
  await page.keyboard.press('Escape');
  await openHelp(page);
  await expect(voice).not.toHaveText(first);
  await expect(guide.locator('#helpInstruction')).toHaveText(instruction);
  expect(await page.evaluate(()=>(window as any).spotlightCalls.filter((call:any)=>/interact_character/.test(call.command)).length)).toBe(0);
});
