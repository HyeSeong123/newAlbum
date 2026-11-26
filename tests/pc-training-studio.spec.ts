import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const origin = 'http://studio.test';
const assets = resolve('local-ai/own/studio');
const state = {
  characters: { shared: { gomi: '고미' }, dorongi: { apple: '도롱이' } },
  actions: { shared: { gomi: ['treat'] }, dorongi: { apple: ['training'] } },
  labels: { training: '훈련하기' }, token: 'test', numpy: true, job: null,
};

test.beforeEach(async ({ page }) => {
  await page.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/state') return route.fulfill({ json: state });
    if (path === '/api/example') return route.fulfill({ json: route.request().postDataJSON().row });
    if (path === '/api/compare') return route.fulfill({ json: { standard: { status: 'nonverbal' }, candidate: null } });
    if (path === '/') return route.fulfill({ path: resolve(assets, 'index.html') });
    if (path === '/studio.js' || path === '/style.css') return route.fulfill({ path: resolve(assets, path.slice(1)) });
    if (path === '/gomi.webp') return route.fulfill({ path: resolve('public/characters/gomi/retreat-look-back.webp') });
    return route.abort();
  });
});

test('saves sleepy and exhausted dialogue as distinct training situations', async ({ page }) => {
  await page.goto(origin);
  const scene = page.getByLabel('어떤 상황인가요?');
  for (const [label, energy] of [['자고 있을 때', 1], ['너무 피곤해서 계속 잘 때', 0]] as const) {
    await scene.selectOption({ label });
    await page.getByLabel('캐릭터가 할 말').fill('간식은 조금 있다가 줘.');
    const request = page.waitForRequest(origin + '/api/example');
    await page.getByRole('button', { name: '대사 목록에 추가' }).click();
    expect((await request).postDataJSON()).toMatchObject({
      target: 'shared', row: { characterId: 'gomi', action: 'treat', affection: 75, energy, sleeping: true, mood: 'sleepy' },
    });
    await expect(page.locator('#queue')).toContainText(label);
  }
  await page.getByLabel('얼마나 친한가요?').selectOption({ label: '아직 낯선 사이' });
  await expect(page.locator('#quiet-hint')).toBeVisible();
  await expect(page.getByRole('button', { name: '대사 목록에 추가' })).toBeDisabled();
  await page.getByRole('button', { name: '대사 비교하기' }).click();
  await expect(page.locator('#before')).toContainText('말없이');
  await scene.selectOption({ label: '추울 때' });
  await expect(page.getByRole('button', { name: '대사 목록에 추가' })).toBeEnabled();
});

test('restores earlier model-based drafts and trains dialogue for the selected character', async ({ page }) => {
  const row = {
    characterId: 'apple', action: 'training', affection: 72.5, energy: 4, sleeping: false,
    condition: 'normal', mood: 'curious', meaning: 'new-step', reply: '한 걸음씩 걸어 보시오.',
  };
  await page.addInitScript((row) => {
    sessionStorage.setItem('gomgomi-studio', JSON.stringify({ target: 'dorongi', drafts: { shared: [], dorongi: [row] } }));
  }, row);
  await page.goto(origin);
  await expect(page.getByRole('combobox', { name: '캐릭터', exact: true })).toHaveValue('apple');
  await expect(page.locator('#queue')).toContainText(row.reply);
  await page.getByRole('combobox', { name: '캐릭터', exact: true }).selectOption('gomi');
  await expect(page.locator('#queue')).toBeEmpty();
  await page.getByRole('combobox', { name: '캐릭터', exact: true }).selectOption('apple');
  await page.getByRole('button', { name: '한 번만 연습' }).click();
  await page.route(origin + '/api/start', (route) => route.fulfill({ json: {
    target: 'dorongi', status: 'starting', epoch: 0, epochs: 1, added: 1, seconds: 0,
  } }));
  const request = page.waitForRequest(origin + '/api/start');
  await page.getByRole('button', { name: '학습 시작' }).click();
  expect((await request).postDataJSON()).toEqual({ target: 'dorongi', rows: [row], epochs: 1 });
});
