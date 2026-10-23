import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/review-face.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    const people = [{ id: 1, name: '미정' }, { id: 2, name: '경록' }, { id: 99, name: '' }];
    const faces = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, media_id: i + 1, person_id: 99, confirmed: false, thumbnail: '/review-face.jpg' }));
    let characters = ['gomi', 'potato'].map(id => ({ id, customName: id === 'potato' ? '우리 감자' : null, growthStage: id === 'gomi' ? 6 : 1, affection: 0, isMain: id === 'potato', regionPhotoCount: 0, unlockedAt: '2026-10-23', createdAt: '2026-10-23', updatedAt: '2026-10-23' }));
    const calls: { command: string; args: Record<string, unknown> }[] = [];
    Object.assign(window, { helpUxCalls: calls });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/review-face.jpg',
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args });
        if (command === 'sync_characters') return { characters, events: [] };
        if (command === 'set_main_character') { characters = characters.map(c => ({ ...c, isMain: c.id === args.id })); return { characters, events: [] }; }
        if (command === 'list_media' || command === 'list_albums' || command === 'list_diary' || command === 'list_pets') return [];
        if (command === 'list_face_index') return structuredClone({ people, faces, scanned: [] });
        if (command === 'find_face_matches') return faces.filter(f => f.id < 30).map(f => ({ face_id: f.id, person_id: 1, candidates: [{ person_id: 1, distance: .3, references: 2 }, { person_id: 2, distance: .4, references: 2 }] }));
        if (command === 'move_faces') { faces.filter(f => (args.ids as number[]).includes(f.id)).forEach(f => { f.person_id = args.target as number; f.confirmed = true; }); return; }
        if (command === 'list_pet_jobs') return { pending: 0, paused: 0, failed: 1, jobs: [{ id: 1, media_id: 1, pet_id: null, view: 'unknown', state: 'failed', error: 'The file extension `."HEIC"` was not recognized as an image format (/private/photo.HEIC)' }] };
        return [];
      },
    } });
  });
  await page.goto('/');
}

test('all help uses the selected character, including nested help and changed selection', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '사용 방법 도움말 열기' }).click();
  const guide = page.getByRole('dialog', { name: '사용 방법', exact: true });
  await expect(guide.locator('.characterHelpName')).toHaveText('우리 감자');
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-character', 'potato');
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-stage', '1');
  await guide.getByRole('button', { name: '도움말 닫기' }).click();
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '미확인 인물 다시 확인', exact: true }).click();
  const review = page.getByRole('dialog', { name: '미확인 인물 다시 확인', exact: true });
  await review.getByRole('button', { name: '미확인 인물 다시 확인 도움말', exact: true }).click();
  const help = page.getByRole('dialog', { name: '미확인 인물 다시 확인 도움말', exact: true });
  await expect(help.locator('.characterHelpName')).toHaveText('우리 감자');
  await expect(help.locator('.characterHelpLines')).toContainText('추천 이름으로 저장');
  await page.screenshot({ path: `preview-results/help-review/character-help-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(review).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await page.getByRole('button', { name: '새싹 도감 보기' }).click();
  await page.locator('.characterCard').filter({ has: page.getByRole('heading', { name: '고미', exact: true }) }).getByRole('button', { name: '대표로 설정' }).click();
  await page.getByRole('button', { name: '사용 방법 도움말 열기' }).click();
  await expect(guide.locator('.characterHelpName')).toHaveText('고미');
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-character', 'gomi');
});

test('first-run guidance uses the saved main character too', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => localStorage.removeItem('geuruteogi.first-run-completed-v1'));
  await page.reload();
  const guide = page.getByRole('dialog', { name: '감자싹에 사진을 담아보세요', exact: true });
  await expect(guide.locator('.characterHelpName')).toHaveText('우리 감자');
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-character', 'potato');
  await expect(guide.getByRole('button', { name: '우리 감자와 사용 방법 살펴보기' })).toBeVisible();
});

test('legacy HEIC errors show Korean recovery guidance without native error details', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '이어서 분석', exact: true }).click();
  const status = page.locator('.petAnalysisNotice [role="status"]');
  await expect(status).toContainText('이 HEIC 사진은 현재 읽을 수 없어요.');
  await expect(status).toContainText('JPG 또는 PNG로 변환한 사진을 다시 가져와 주세요.');
  await expect(status).not.toContainText('file extension');
  await expect(status).not.toContainText('/private');
});

test('review retains selections across pages, saves edited candidates, and fits phone sizes', async ({ page, isMobile }) => {
  await prepare(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '미확인 인물 다시 확인', exact: true }).click();
  const review = page.getByRole('dialog', { name: '미확인 인물 다시 확인', exact: true });
  await expect(review.locator('.faceMatchItem')).toHaveCount(24);
  await review.getByRole('checkbox', { name: '미확인 얼굴 1 선택', exact: true }).check();
  await review.getByRole('combobox', { name: '미확인 얼굴 1 인물 후보', exact: true }).selectOption('2');
  await review.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(review.locator('.faceMatchItem')).toHaveCount(6);
  await review.getByRole('checkbox', { name: '미확인 얼굴 25 선택', exact: true }).check();
  await expect(review.locator('.faceMatchSelection')).toContainText('2개 선택');
  await review.getByRole('button', { name: '이전 페이지', exact: true }).click();
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 1 선택', exact: true })).toBeChecked();
  await expect(review.getByRole('combobox', { name: '미확인 얼굴 1 인물 후보', exact: true })).toHaveValue('2');
  if (isMobile) for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });
    const bounds = (await review.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(780);
    expect(await review.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await expect(review.locator('.faceMatchSaveActions')).toBeInViewport();
    await page.screenshot({ path: `preview-results/help-review/review-${width}.png` });
  }
  await review.getByRole('button', { name: '추천 이름으로 저장 (2)', exact: true }).click();
  await expect(review).toBeHidden();
  const calls = await page.evaluate(() => (window as unknown as { helpUxCalls: { command: string; args: unknown }[] }).helpUxCalls);
  expect(calls.filter(c => c.command === 'move_faces').map(c => c.args)).toEqual([{ ids: [1], target: 2 }, { ids: [25], target: 1 }]);
  expect(calls.filter(c => ['save_face_scan', 'enqueue_pet_jobs'].includes(c.command))).toEqual([]);
});
