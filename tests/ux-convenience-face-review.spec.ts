import { expect, test, type Page, type Locator } from '@playwright/test';

const stage = process.env.UX_AUDIT_STAGE === 'before' ? 'before' : 'after';

async function expectDialogControlsClearOfHelp(page: Page, dialog: Locator) {
  expect(page.viewportSize()?.width).toBe(393);
  const help = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  await expect(help).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const helpBox = await help.boundingBox();
  expect(helpBox).not.toBeNull();
  // Measure the actual error state without scrolling the alert or candidates away.
  for (const control of await dialog.locator('select, [role="alert"], footer button').all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    if (box && helpBox) {
      const overlaps = box.x < helpBox.x + helpBox.width && box.x + box.width > helpBox.x
        && box.y < helpBox.y + helpBox.height && box.y + box.height > helpBox.y;
      expect(overlaps, `Help overlaps ${await control.getAttribute('aria-label') ?? await control.textContent()}`).toBe(false);
    }
  }
  const actions = dialog.locator('footer button');
  expect(await actions.count()).toBeGreaterThan(0);
  for (const action of await actions.all()) {
    const dimensions = await action.evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    // Wrapped text is allowed; horizontal clipping is not.
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
}

type AuditState = { moves: { ids: number[]; target: number }[]; refreshes: number; release?: () => void };

async function prepare(page: Page, mode: 'partial' | 'refresh' | 'compound') {
  await page.route('**/retry-review-face.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(({ mode, gateRefresh }) => {
    const people = [{ id: 1, name: '미정' }, { id: 2, name: '경록' }, { id: 3, name: '수현' }, { id: 99, name: '' }];
    const faces = [11, 12, 13].map(id => ({ id, media_id: id, person_id: 99, confirmed: false, thumbnail: '/retry-review-face.jpg' }));
    const state: { moves: { ids: number[]; target: number }[]; refreshes: number; release?: () => void } = { moves: [], refreshes: 0 };
    Object.assign(window, { faceReviewAudit: state });
    let failedMove = false;
    let failedRefresh = false;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/retry-review-face.jpg',
      invoke: async (command: string, args: { ids: number[]; target: number }) => {
        if (command === 'list_face_index') {
          state.refreshes++;
          if ((mode === 'refresh' || mode === 'compound') && state.moves.length && !failedRefresh) {
            failedRefresh = true;
            throw new Error('fixture: list refresh unavailable');
          }
          if (gateRefresh && mode === 'refresh' && failedRefresh) await new Promise<void>(resolve => { state.release = resolve; });
          return structuredClone({ people, faces, scanned: [] });
        }
        if (command === 'find_face_matches') return faces.map((face, i) => ({
          face_id: face.id, person_id: i === 2 ? 1 : i + 1,
          candidates: [1, 2, 3].map(person_id => ({ person_id, distance: .3, references: 2 })),
        }));
        if (command === 'move_faces') {
          state.moves.push(structuredClone(args));
          if (state.moves.length === 1) await new Promise<void>(resolve => { state.release = resolve; });
          if ((mode === 'partial' && !failedMove || mode === 'compound') && args.target === 2) {
            failedMove = true;
            throw new Error('fixture: second group unavailable');
          }
          faces.filter(face => args.ids.includes(face.id)).forEach(face => { face.person_id = args.target; face.confirmed = true; });
        }
        return [];
      },
    } });
  }, { mode, gateRefresh: stage === 'after' });
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '미확인 인물 다시 확인', exact: true }).click();
  const review = page.getByRole('dialog', { name: '미확인 인물 다시 확인', exact: true });
  await expect(review.getByRole('checkbox')).toHaveCount(3);
  await review.getByRole('combobox', { name: '미확인 얼굴 13 인물 후보', exact: true }).selectOption('3');
  await review.getByRole('button', { name: '이 페이지 전체 선택', exact: true }).click();
  return review;
}

async function state(page: Page) {
  return page.evaluate(() => {
    const audit = (window as unknown as { faceReviewAudit: AuditState }).faceReviewAudit;
    return { moves: audit.moves, refreshes: audit.refreshes };
  });
}

test('partial face save keeps failed and unprocessed selections for an immediate retry', async ({ page }) => {
  if (stage === 'after') await page.setViewportSize({ width: 393, height: 851 });
  const review = await prepare(page, 'partial');
  await review.getByRole('button', { name: '추천 이름으로 저장 (3)', exact: true }).click();
  await expect.poll(async () => (await state(page)).moves.length).toBe(1);
  await expect(review.getByRole('button', { name: /추천 이름으로 저장/ })).toBeDisabled();
  await expect(review.getByTitle('닫기', { exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { faceReviewAudit: AuditState }).faceReviewAudit.release!());
  await expect(review.getByRole('alert')).toBeVisible();
  await expect.poll(async () => (await state(page)).moves.length).toBe(2);
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 11 선택', exact: true })).toHaveCount(0);
  if (stage === 'before') {
    await expect(review.locator('.faceMatchSelection')).toContainText('0개 선택');
    await expect(review.getByRole('button', { name: /추천 이름으로 저장/ })).toBeDisabled();
    await page.screenshot({ path: `preview-results/ux-convenience/${stage}/05-face-partial-save.png` });
    return;
  }
  await expect(review.getByRole('alert')).toContainText('1개 얼굴은 저장했어요');
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 12 선택', exact: true })).toBeChecked();
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 13 선택', exact: true })).toBeChecked();
  await expect(review.getByRole('combobox', { name: '미확인 얼굴 12 인물 후보', exact: true })).toHaveValue('2');
  await expect(review.getByRole('combobox', { name: '미확인 얼굴 13 인물 후보', exact: true })).toHaveValue('3');
  await expectDialogControlsClearOfHelp(page, review);
  await page.screenshot({ path: `preview-results/ux-convenience/${stage}/05-face-partial-save.png` });
  await review.getByRole('button', { name: '추천 이름으로 저장 (2)', exact: true }).click();
  await expect(review).toBeHidden();
  expect((await state(page)).moves).toEqual([
    { ids: [11], target: 1 }, { ids: [12], target: 2 }, { ids: [12], target: 2 }, { ids: [13], target: 3 },
  ]);
});

test('list retry survives another save failure after a partial save and refresh failure', async ({ page }) => {
  test.skip(stage === 'before', 'Compound recovery requires the preserved selection introduced by the fix.');
  const review = await prepare(page, 'compound');
  await review.getByRole('button', { name: '추천 이름으로 저장 (3)', exact: true }).click();
  await expect.poll(async () => (await state(page)).moves.length).toBe(1);
  await page.evaluate(() => (window as unknown as { faceReviewAudit: AuditState }).faceReviewAudit.release!());
  const refresh = review.getByRole('button', { name: '목록 다시 불러오기', exact: true });
  await expect(refresh).toBeEnabled();
  const refreshes = (await state(page)).refreshes;
  await review.getByRole('button', { name: '추천 이름으로 저장 (2)', exact: true }).click();
  await expect.poll(async () => (await state(page)).moves.length).toBe(3);
  await expect(refresh).toBeEnabled();
  await expect(review.getByRole('alert').filter({ hasText: '목록을 불러오지 못했어요' })).toBeVisible();
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 12 선택', exact: true })).toBeChecked();
  await expect(review.getByRole('checkbox', { name: '미확인 얼굴 13 선택', exact: true })).toBeChecked();
  expect((await state(page)).refreshes).toBe(refreshes);
  await refresh.click();
  await expect(refresh).toHaveCount(0);
  await expect(review).toBeVisible();
  expect((await state(page)).refreshes).toBe(refreshes + 1);
  expect((await state(page)).moves).toEqual([{ ids: [11], target: 1 }, { ids: [12], target: 2 }, { ids: [12], target: 2 }]);
});

test('a list refresh failure after saving offers refresh retry without saving faces again', async ({ page }) => {
  const review = await prepare(page, 'refresh');
  await review.getByRole('button', { name: '추천 이름으로 저장 (3)', exact: true }).click();
  await expect.poll(async () => (await state(page)).moves.length).toBe(1);
  await page.evaluate(() => (window as unknown as { faceReviewAudit: AuditState }).faceReviewAudit.release!());
  await expect(review.getByRole('alert')).toBeVisible();
  if (stage === 'before') {
    await expect(review.getByRole('alert')).toContainText('일부 변경을 저장하지 못했습니다');
    await expect(review.getByRole('button', { name: '목록 다시 불러오기', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `preview-results/ux-convenience/${stage}/06-face-refresh-failure.png` });
    return;
  }
  await expect(review.getByRole('alert')).toContainText('얼굴은 모두 저장했어요');
  await expect(review.getByRole('alert')).toContainText('목록');
  await expect(review.getByRole('button', { name: /추천 이름으로 저장/ })).toBeDisabled();
  await expect(review.getByTitle('닫기', { exact: true })).toBeEnabled();
  await page.screenshot({ path: `preview-results/ux-convenience/${stage}/06-face-refresh-failure.png` });
  const refreshes = (await state(page)).refreshes;
  await review.getByRole('button', { name: '목록 다시 불러오기', exact: true }).click();
  await expect.poll(async () => (await state(page)).refreshes).toBe(refreshes + 1);
  await expect(review.getByRole('button', { name: '목록 다시 불러오기', exact: true })).toBeDisabled();
  await expect(review.getByTitle('닫기', { exact: true })).toBeDisabled();
  expect((await state(page)).moves).toHaveLength(3);
  await page.evaluate(() => (window as unknown as { faceReviewAudit: AuditState }).faceReviewAudit.release!());
  await expect(review).toBeHidden();
  expect((await state(page)).moves).toEqual([{ ids: [11], target: 1 }, { ids: [12], target: 2 }, { ids: [13], target: 3 }]);
  expect((await state(page)).refreshes).toBe(refreshes + 1);
});
