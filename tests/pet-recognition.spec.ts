import { expect, test } from '@playwright/test';

test('local pet models detect a dog and produce comparable features', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Real inference runs once on desktop; review flow is tested on both viewports.');
  test.setTimeout(120000);
  await page.route('**/pet-test.jpg', (route) => route.fulfill({ path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
  await page.route('**/pet-negative.jpg', (route) => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const external: string[] = [];
  page.on('request', (request) => { if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  const result = await page.evaluate(async () => {
    const path = '/src/features/pets/petRecognition.ts';
    const { describePets, similarity } = await import(/* @vite-ignore */ path);
    const features = await describePets('/pet-test.jpg');
    const negative = await describePets('/pet-negative.jpg');
    return { count: features.length, negative: negative.length, kind: features[0]?.kind, length: features[0]?.vector.length, score: similarity(features, features), crossSpecies: similarity(features, features.map((f: { vector: number[] }) => ({ ...f, kind: 'cat' }))) };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.kind).toBe('dog');
  expect(result.length).toBe(1024);
  expect(result.score).toBeCloseTo(1, 4);
  expect(result.crossSpecies).toBe(0);
  expect(result.negative).toBe(0);
  expect(external).toEqual([]);
});
