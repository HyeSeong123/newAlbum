import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('pets collect photos manually and preserve originals', async ({ page }) => {
  const thumbnail = `data:image/jpeg;base64,${(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail }) => {
    type Pet = { id: number; name: string; media_ids: number[]; cover_media_id: number | null };
    let pets: Pet[] = JSON.parse(localStorage.getItem('pet-test') ?? '[]');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => thumbnail,
      invoke: async (command: string, args: { id: number | null; name: string; mediaIds: number[]; coverMediaId: number | null }) => {
        if (command === 'list_media') return [1, 2, 3].map((id) => ({ id, file_path: `C:/pet/${id}.jpg`, file_type: 'image', taken_at: `2026-09-0${id}`, size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
        if (command === 'list_albums') return [];
        if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
        if (command === 'list_pets') return pets;
        if (command === 'save_pet') {
          const id = args.id ?? 1;
          pets = [...pets.filter((pet) => pet.id !== id), { id, name: args.name, media_ids: args.mediaIds, cover_media_id: args.coverMediaId }];
          localStorage.setItem('pet-test', JSON.stringify(pets));
          return id;
        }
        if (command === 'delete_pet') { pets = pets.filter((pet) => pet.id !== args.id); localStorage.setItem('pet-test', JSON.stringify(pets)); }
      },
    } });
  }, { thumbnail });
  await page.goto('/');
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await expect(page.getByRole('button', { name: '반려동물', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '사람', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '반려동물', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '반려동물 등록', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('보리');
  const choices = page.getByRole('button', { name: '사진 선택', exact: true });
  await choices.nth(0).click();
  await choices.nth(1).click();
  await page.locator('.petEditor img').first().evaluate((img: HTMLImageElement) => img.decode());
  await page.getByLabel('대표 사진', { exact: true }).selectOption('2');
  await page.screenshot({ path: `test-results/pet-editor-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '보리', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '사진 상세보기', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '사진 상세보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.getByTitle('닫기').click();
  await page.getByRole('button', { name: '사진·이름 편집', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('우리 보리');
  await page.getByRole('button', { name: '사진 선택', exact: true }).first().click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '사진 상세보기', exact: true })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await expect(page.getByRole('button', { name: '우리 보리 1장', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/pet-list-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '우리 보리 1장', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '등록 삭제', exact: true }).click();
  await expect(page.getByText('아직 등록한 반려동물이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '사진보기', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(3);
});
