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
