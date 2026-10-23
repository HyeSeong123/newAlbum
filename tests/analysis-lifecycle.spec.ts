import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, deferredGallery = false) {
  await page.route('**/lifecycle-photo.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(({ deferredGallery }) => {
    const calls: { command: string; args: any }[] = [];
    let media = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, file_path: `/pictures/${i + 1}.jpg`, file_type: 'image', taken_at: '2026-10-23', size_bytes: 1000, rating: 0, favorite: false, comment: '', metadata_status: 'ready' }));
    const scanned = new Set<number>(), petScans = new Map<number, any>();
    const jobs: any[] = [];
    let personStarted = false, pausedDuringPersonWork = false;
    Object.assign(window, { lifecycle: { calls, scanned, jobs, get pausedDuringPersonWork() { return pausedDuringPersonWork; } } });
    class FixtureWorker extends EventTarget {
      stopped = false;
      postMessage(request: any) {
        setTimeout(() => { if (!this.stopped) this.dispatchEvent(new MessageEvent('message', { data: { id: request.id, faces: [], features: [] } })); }, request.pixels ? 550 : 15);
      }
      terminate() { this.stopped = true; }
    }
    Object.defineProperty(window, 'Worker', { value: FixtureWorker, configurable: true });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/lifecycle-photo.jpg',
      invoke: async (command: string, args: any = {}) => {
        calls.push({ command, args });
        if (command === 'compare_android_gallery') {
          if (deferredGallery) await new Promise<void>(resolve => Object.assign(window, { releaseGallery: resolve }));
          return { checked: 6, present: 2, missing: 1, unavailable: 1, untracked: 2, missingCopies: 0 };
        }
        if (command === 'list_media') return structuredClone(media);
        if (command === 'list_albums' || command === 'list_diary' || command === 'list_pet_detections' || command === 'list_unknown_pet_items') return [];
        if (command === 'media_thumbnail') return '/lifecycle-photo.jpg';
        if (command === 'list_face_index') return { people: [], faces: [], scanned: [...scanned] };
        if (command === 'audit_person_scans') return { items: [], nextCursor: 0, done: true };
        if (command === 'control_person_jobs') { if (args.resume) personStarted = true; else if (personStarted && scanned.size < 6) pausedDuringPersonWork = true; return; }
        if (command === 'get_person_scan_source') return { source_key: 'fixture', completed: scanned.has(args.mediaId) };
        if (command === 'save_face_scan') { scanned.add(args.mediaId); return; }
        if (command === 'list_pets') return [{ id: 1, name: '보리', media_ids: [1], cover_media_id: 1 }];
        if (command === 'enqueue_pet_jobs') { for (const job of args.jobs) jobs.push({ ...job, id: jobs.length + 1, media_id: job.mediaId, pet_id: job.petId, state: 'pending', error: '' }); return; }
        if (command === 'list_pet_jobs') { const rows = jobs.filter(j => j.state !== 'done'); return { jobs: structuredClone(rows), pending: rows.filter(j => j.state === 'pending').length, paused: rows.filter(j => j.state === 'paused').length, failed: rows.filter(j => j.state === 'failed').length }; }
        if (command === 'finish_pet_job') { const job = jobs.find(j => j.id === args.id); if (job) { job.state = args.error ? 'failed' : 'done'; job.error = args.error || ''; } return; }
        if (command === 'control_pet_jobs') { jobs.filter(j => j.state !== 'done').forEach(j => { j.state = args.resume ? 'pending' : 'paused'; }); return; }
        if (command === 'prepare_pet_input') return { path: '/lifecycle-photo.jpg', sourceKey: 'fixture' };
        if (command === 'get_pet_scan') return petScans.get(args.mediaId) ?? null;
        if (command === 'save_pet_scan') { const scan = { media_id: args.mediaId, engine_version: 'fixture', source_key: 'fixture', detections: [] }; petScans.set(args.mediaId, scan); return scan; }
        if (command === 'delete_registered_media') { media = media.filter(m => !args.ids.includes(m.id)); return structuredClone(media); }
        return [];
      },
    } });
  }, { deferredGallery });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

test('startup compares gallery once, blocks briefly, and preserves saved copies when originals are missing', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Android gallery permission workflow.');
  await prepare(page, true);
  const waiting = page.getByRole('dialog', { name: '갤러리와 사진을 비교하고 있어요', exact: true });
  await expect(waiting).toBeVisible();
  await expect(page.locator('main.app')).toHaveAttribute('inert', '');
  await page.evaluate(() => (window as any).releaseGallery());
  await expect(waiting).toBeHidden();
  await expect(page.locator('main.app')).not.toHaveAttribute('inert', '');
  await expect(page.getByText(/갤러리에서 삭제된 원본 1개/)).toBeVisible();
  await expect(page.getByText(/권한 또는 접근 문제로 원본 1개/)).toBeVisible();
  const calls = await page.evaluate(() => (window as any).lifecycle.calls);
  expect(calls.filter((c: any) => c.command === 'compare_android_gallery')).toHaveLength(1);
  expect(calls.filter((c: any) => ['delete_registered_media', 'enqueue_pet_jobs', 'enqueue_person_jobs'].includes(c.command))).toHaveLength(0);
});

test('person analysis survives screen changes and media updates; its progress panel never locks navigation', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('button', { name: '사진에서 사람 찾기', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '분석 중 · 진행상황 보기' })).toBeVisible();
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  await page.getByRole('dialog', { name: '사진 상세' }).getByTitle('즐겨찾기', { exact: true }).click();
  await page.getByRole('dialog', { name: '사진 상세' }).getByTitle('닫기', { exact: true }).click();
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).lifecycle.scanned.size)).toBe(6);
  expect(await page.evaluate(() => (window as any).lifecycle.pausedDuringPersonWork)).toBe(false);
  await page.getByRole('button', { name: '분석 결과 · 진행상황 보기' }).click();
  const panel = page.getByRole('region', { name: '분석 진행상황', exact: true });
  await expect(panel).toContainText('6 / 6장');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.screenshot({ path: `preview-results/analysis-lifecycle/person-${test.info().project.name}.png` });
  await page.locator('.navList').getByRole('button', { name: '일기장', exact: true }).click();
  await expect(page.locator('.diaryView')).toBeVisible();
});

test('pet analysis continues after leaving its selection screen and has an explicit stop action', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '사진에서 반려동물 감지', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '반려동물 감지할 사진 선택', exact: true });
  await picker.getByRole('button', { name: '전체 선택', exact: true }).click();
  await picker.getByRole('button', { name: '반려동물 감지', exact: true }).click();
  await expect(page.getByRole('button', { name: '분석 중 · 진행상황 보기' })).toBeVisible();
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await page.getByRole('button', { name: '분석 중 · 진행상황 보기' }).click();
  const panel = page.getByRole('region', { name: '분석 진행상황', exact: true });
  await expect(panel.getByRole('button', { name: '분석 중단', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await expect.poll(() => page.evaluate(() => (window as any).lifecycle.jobs.filter((j: any) => j.state === 'done').length)).toBeGreaterThan(0);
  await panel.getByRole('button', { name: '분석 중단', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).lifecycle.jobs.filter((j: any) => j.state === 'paused').length)).toBeGreaterThan(0);
  await panel.getByRole('button', { name: '이어서 분석', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).lifecycle.jobs.filter((j: any) => j.state === 'done').length)).toBe(6);
  await expect(panel).toContainText('6 / 6장');
  await expect(page.getByRole('button', { name: '분석 결과 · 진행상황 보기' })).toBeVisible();
});

test('detail delete supports cancel, removes exactly the current item, and returns to the list', async ({ page }) => {
  await prepare(page);
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 기록', exact: true }).click();
  await page.locator('.mediaTile').first().click();
  const detail = page.getByRole('dialog', { name: '사진 상세', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await detail.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(detail).toBeVisible();
  expect(await page.evaluate(() => (window as any).lifecycle.calls.filter((c: any) => c.command === 'delete_registered_media').length)).toBe(0);
  page.once('dialog', dialog => { expect(dialog.message()).toContain('휴대폰의 원본 파일은 그대로'); return dialog.accept(); });
  await detail.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(detail).toBeHidden();
  await expect(page.locator('.topbar')).toContainText('5개의 기록');
  const deletes = await page.evaluate(() => (window as any).lifecycle.calls.filter((c: any) => c.command === 'delete_registered_media'));
  expect(deletes).toHaveLength(1);
  expect(deletes[0].args.ids).toHaveLength(1);
});
