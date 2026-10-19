import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// The same model bytes are exercised in Node and a real browser Worker.
test.beforeAll(() => { execFileSync(process.execPath, ['scripts/native-ai/train.mjs', '--epochs', '6'], { stdio: 'pipe' }); });
test('exported own model runs in Worker, agrees with Node and reuses loaded weights offline', async ({ page, context }) => {
  const model = await readFile('native-ai-output/model.json', 'utf8');
  const provenance = JSON.parse(await readFile('native-ai-output/provenance.json', 'utf8'));
  let loads = 0;
  await page.route('**/models/native-dev/probe.json', route => { loads++; return route.fulfill({ body: model, contentType: 'application/json' }); });
  await page.goto('/');
  const requests: string[] = [];
  page.on('request', request => { if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) requests.push(request.url()); });
  const first = await page.evaluate(async ({ hash }) => {
    const clientPath = '/src/features/ai/native/client.ts', netPath = '/src/features/ai/native/network.ts';
    const { runSyntheticProbe } = await import(/* @vite-ignore */ clientPath), { synthetic } = await import(/* @vite-ignore */ netPath);
    const result = await runSyntheticProbe({ intent: 'user-request', image: synthetic().validation[0].image, modelUrl: '/models/native-dev/probe.json', sha256: hash });
    return result;
  }, { hash: provenance.weightsSha256 });
  expect(first).toEqual(provenance.probe);
  expect(first.identitySupported).toBe(false); expect(loads).toBe(1);
  await context.setOffline(true);
  const second = await page.evaluate(async hash => {
    const clientPath = '/src/features/ai/native/client.ts', netPath = '/src/features/ai/native/network.ts';
    const { runSyntheticProbe, disposeNativeAI } = await import(/* @vite-ignore */ clientPath), { synthetic } = await import(/* @vite-ignore */ netPath);
    const result = await runSyntheticProbe({ intent: 'user-request', image: synthetic().validation[0].image, modelUrl: '/models/native-dev/probe.json', sha256: hash });
    disposeNativeAI(); return result;
  }, provenance.weightsSha256);
  expect(second).toEqual(first); expect(loads).toBe(1); expect(requests).toEqual([]);
  await context.setOffline(false);
});

test('native mode rejects legacy recognition before any image/model request; cancelled work can restart', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const peoplePath = '/src/features/people/engine/client.ts', petsPath = '/src/features/pets/engine/client.ts';
    const nativePath = '/src/features/ai/native/client.ts', netPath = '/src/features/ai/native/network.ts';
    const people = await import(/* @vite-ignore */ peoplePath), pets = await import(/* @vite-ignore */ petsPath);
    const { runSyntheticProbe } = await import(/* @vite-ignore */ nativePath), { synthetic } = await import(/* @vite-ignore */ netPath);
    const fetchOriginal = window.fetch; let calls = 0;
    window.fetch = (() => { calls++; throw new Error('unexpected network'); }) as typeof fetch;
    try {
      const unavailable = await Promise.allSettled([people.analyzePersonImage('/never-fetch.jpg'), people.loadPersonEngine(), pets.analyzePetImage('/never-fetch.jpg')]);
      const controller = new AbortController(); controller.abort();
      const cancel = await runSyntheticProbe({ intent: 'user-request', image: synthetic().train[0].image, modelUrl: '/models/native-dev/probe.json', sha256: 'a'.repeat(64) }, controller.signal).then(() => 'unexpected', (e: Error) => e.name);
      return { unavailable: unavailable.map(x => x.status === 'rejected' ? String(x.reason.message) : 'unexpected'), calls, cancel };
    } finally { window.fetch = fetchOriginal; }
  });
  expect(result.calls).toBe(0); expect(result.cancel).toBe('AbortError');
  expect(result.unavailable).toHaveLength(3);
  for (const error of result.unavailable) expect(error).toContain('아직 학습되지 않았습니다');
});

test('untrained UI actions preserve durable queues and cached scans before inference', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = []; (window as unknown as { nativeCalls: string[] }).nativeCalls = calls;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: () => '/favicon.svg', invoke: async (command: string) => {
      calls.push(command);
      if (command === 'list_media') return [1, 2].map(id => ({ id, file_path: `photo${id}.jpg`, file_type: 'image', taken_at: '2026-10-10', size_bytes: 1, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
      if (command === 'list_pets') return [{ id: 1, name: '보리', cover_media_id: 1, media_ids: [1] }];
      if (command === 'list_pet_jobs') return { jobs: [], pending: 0, paused: 0, failed: 0 };
      return [];
    } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
  await page.getByRole('group', { name: '얼굴 분석', exact: true }).getByRole('button', { name: '사진에서 사람 찾기', exact: true }).click();
  await expect(page.getByText(/자체 AI 인식 모델은 아직 학습되지 않았습니다/)).toBeVisible();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '등록된 사진에서 찾기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '등록된 사진에서 찾기', exact: true });
  await dialog.getByRole('button', { name: '사진 찾기 시작', exact: true }).click();
  await expect(dialog.getByText(/자체 AI 인식 모델은 아직 학습되지 않았습니다/)).toBeVisible();
  const mutations = await page.evaluate(() => (window as unknown as { nativeCalls: string[] }).nativeCalls.filter(command => ['enqueue_person_jobs', 'retry_empty_face_scans', 'enqueue_pet_jobs', 'prepare_pet_input', 'save_face_scan', 'save_pet_scan'].includes(command)));
  expect(mutations).toEqual([]);
});
