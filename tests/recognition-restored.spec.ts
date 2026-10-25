import { test, expect } from '@playwright/test';

test('restored recognition waits for an explicit request, including existing pending work', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = []; (window as unknown as { recognitionCalls: string[] }).recognitionCalls = calls;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: () => '/favicon.svg', invoke: async (command: string) => {
      calls.push(command);
      if (command === 'list_media') return Array.from({ length: 100 }, (_, i) => ({ id: i + 1, file_path: `photo${i}.jpg`, file_type: 'image', taken_at: '2026-10-10', size_bytes: 1, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
      if (command === 'list_pets') return [{ id: 1, name: '보리', cover_media_id: 1, media_ids: [1] }];
      if (command === 'list_pet_jobs') return { jobs: [{ id: 1, media_id: 1, pet_id: 1, view: 'unknown', state: 'pending', error: '' }], pending: 1, paused: 0, failed: 0 };
      return [];
    } } });
  });
  const modelRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.includes('/models/')) modelRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await expect(page.getByRole('button', { name: '사진에서 사람 찾기', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await expect(page.getByRole('button', { name: '반려동물 사진 찾기', exact: true })).toBeEnabled();
  await expect(page.getByText(/이전 분석 1장이 대기/)).toBeVisible();
  expect(modelRequests).toEqual([]);
  const mutations = await page.evaluate(() => (window as unknown as { recognitionCalls: string[] }).recognitionCalls.filter(command => ['enqueue_person_jobs', 'enqueue_pet_jobs', 'prepare_pet_input', 'save_face_scan', 'save_pet_scan'].includes(command)));
  expect(mutations).toEqual([]);
  if (!await page.getByRole('button', { name: '설정', exact: true }).isVisible()) await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '인식 검증 열기 · 고급', exact: true }).click();
  await expect(page.getByText('자체 AI 준비 중', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '합성 모델 실행 점검', exact: true })).toHaveCount(0);
});
