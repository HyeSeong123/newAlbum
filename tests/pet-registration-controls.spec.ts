import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/pet-controls.jpg', route => route.fulfill({ path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    const pets: { id: number; name: string; media_ids: number[]; cover_media_id: number | null }[] = [{ id: 1, name: '써니', media_ids: [1], cover_media_id: 1 }];
    const calls: { command: string; args: any }[] = [];
    const detections = [{ id: 2, media_id: 2, kind: 'cat', pet_id: null as number | null }, { id: 3, media_id: 3, kind: 'dog', pet_id: null as number | null }];
    Object.assign(window, { petControls: { calls } });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/pet-controls.jpg',
      invoke: async (command: string, args: any = {}) => {
        calls.push({ command, args });
        if (command === 'check_android_location_setup') return { locationEnabled: true, photoLocationGranted: true };
        if (command === 'list_media') return [1, 2, 3].map(id => ({ id, file_path: `/photos/${id}.jpg`, file_type: 'image', width: 800, height: 600, size_bytes: 100, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
        if (command === 'list_pets') return structuredClone(pets);
        if (command === 'media_thumbnail') return '/pet-controls.jpg';
        if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
        if (command === 'list_pet_jobs') return { jobs: [], pending: 0, paused: 0, failed: 0 };
        if (command === 'list_unknown_pet_items') return detections.filter(row => row.pet_id === null).map(row => ({ ...row, box_: [.1, .1, .8, .8] }));
        if (command === 'assign_pet_detections') {
          if (localStorage.getItem('pet-assignment-fail')) throw '저장 실패';
          const target = args.target ?? 2;
          if (!args.target) pets.push({ id: target, name: args.name, media_ids: [], cover_media_id: null });
          const pet = pets.find(row => row.id === target)!;
          for (const row of detections.filter(row => args.ids.includes(row.id))) {
            row.pet_id = target;
            if (args.kind) row.kind = args.kind;
            if (!pet.media_ids.includes(row.media_id)) pet.media_ids.push(row.media_id);
          }
          return target;
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
}

test('registered-reference actions replace independent detection and align on mobile', async ({ page, isMobile }) => {
  await prepare(page);
  await page.screenshot({ path: `preview-results/pet-registration-controls-${process.env.PET_CONTROLS_STAGE ?? 'after'}-${test.info().project.name}.png` });
  await expect(page.getByRole('button', { name: '사진에서 반려동물 감지', exact: true })).toHaveCount(0);
  const toolbar = page.locator('.petsView .entityToolbar');
  await expect(toolbar.getByRole('button', { name: '인식 기준 갱신', exact: true })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: '반려동물 사진 찾기', exact: true })).toBeEnabled();
  if (isMobile) {
    await page.getByRole('button', { name: '크게 보기', exact: true }).click();
    for (const width of [393, 320]) {
      await page.setViewportSize({ width, height: 851 });
      const boxes = await toolbar.locator('button').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, scroll: node.scrollWidth, client: node.clientWidth };
      }));
      expect(boxes).toHaveLength(4);
      for (const box of boxes) {
        expect(box.h).toBeGreaterThanOrEqual(44);
        expect(box.scroll).toBeLessThanOrEqual(box.client);
        expect(box.x + box.w).toBeLessThanOrEqual(width);
      }
      expect(Math.abs(boxes[0].w - boxes[1].w)).toBeLessThan(1);
      expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
      expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThan(1);
    }
    await page.setViewportSize({ width: 393, height: 851 });
    await page.screenshot({ path: 'preview-results/pet-registration-controls-large-text-mobile.png' });
  }
  expect(await page.evaluate(() => (window as any).petControls.calls.filter((call: any) => ['enqueue_pet_jobs', 'prepare_pet_input'].includes(call.command)))).toEqual([]);
  await toolbar.getByRole('button', { name: '인식 기준 갱신', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).petControls.calls.filter((call: any) => call.command === 'enqueue_pet_jobs').map((call: any) => call.args))).toEqual([{ jobs: [{ mediaId: 1, petId: 1, view: 'unknown', refresh: true }] }]);
});

async function openMixedSelection(page: Page) {
  await prepare(page);
  await page.getByRole('button', { name: '미확인 반려동물', exact: true }).click();
  await page.locator('.petsView .entityHeader').getByRole('button', { name: '선택', exact: true }).click();
  await page.getByRole('button', { name: '현재 페이지 전체 선택', exact: true }).click();
  await page.getByRole('button', { name: '이름 지정', exact: true }).click();
  return page.getByRole('dialog', { name: '이름 지정', exact: true });
}

for (const mode of ['existing', 'new'] as const) {
  for (const kind of ['', 'dog', 'cat']) {
    test(`mixed detections can be named: ${mode}, kind=${kind || 'unchanged'}`, async ({ page }) => {
      const dialog = await openMixedSelection(page);
      if (mode === 'existing') await dialog.getByLabel('반려동물 선택', { exact: true }).selectOption('1');
      else {
        await dialog.getByRole('button', { name: '새 반려동물', exact: true }).click();
        await dialog.getByLabel('새 반려동물 이름', { exact: true }).fill('새 친구');
      }
      await dialog.getByLabel('인식된 종류 바로잡기', { exact: true }).selectOption(kind);
      if (mode === 'existing' && kind === 'dog') await page.screenshot({ path: `preview-results/pet-review-manual-assignment-dialog-${test.info().project.name}.png` });
      await dialog.getByRole('button', { name: '이름 지정', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText('미확인 반려동물이 없습니다.', { exact: false })).toBeVisible();
      const args = await page.evaluate(() => (window as any).petControls.calls.filter((call: any) => call.command === 'assign_pet_detections').map((call: any) => call.args));
      expect(args).toEqual([{ ids: [2, 3], target: mode === 'existing' ? 1 : null, name: mode === 'new' ? '새 친구' : null, kind: kind || null }]);
      if (mode === 'existing' && kind === 'dog') await page.screenshot({ path: `preview-results/pet-review-manual-assignment-saved-${test.info().project.name}.png` });
    });
  }
}

test('failed manual assignment retains the target, kind and selection for retry', async ({ page }) => {
  const dialog = await openMixedSelection(page);
  await dialog.getByLabel('반려동물 선택', { exact: true }).selectOption('1');
  await dialog.getByLabel('인식된 종류 바로잡기', { exact: true }).selectOption('dog');
  await page.evaluate(() => localStorage.setItem('pet-assignment-fail', '1'));
  await dialog.getByRole('button', { name: '이름 지정', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('저장 실패');
  await expect(dialog.getByLabel('반려동물 선택', { exact: true })).toHaveValue('1');
  await expect(dialog.getByLabel('인식된 종류 바로잡기', { exact: true })).toHaveValue('dog');
  await page.screenshot({ path: `preview-results/pet-review-manual-assignment-retry-${test.info().project.name}.png` });
  await page.evaluate(() => localStorage.removeItem('pet-assignment-fail'));
  await dialog.getByRole('button', { name: '이름 지정', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('미확인 반려동물이 없습니다.', { exact: false })).toBeVisible();
  const args = await page.evaluate(() => (window as any).petControls.calls.filter((call: any) => call.command === 'assign_pet_detections').map((call: any) => call.args));
  expect(args).toEqual([{ ids: [2, 3], target: 1, name: null, kind: 'dog' }, { ids: [2, 3], target: 1, name: null, kind: 'dog' }]);
});
