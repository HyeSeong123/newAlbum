import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Real installed WebView actions and SQLite calls; no mocked IPC or app-only test APIs.
export async function verifyInstalledAppUx(page, mediaId, pet, back, capture) {
  const petHeading=await page.locator('.petsView h2').innerText();
  await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('button',{name:'사진 선택',exact:true}).first().click();
  await expect(page.locator('.entitySelectionBar')).toContainText('사진 1개 선택');
  await back();await expect(page.locator('.petsView h2')).toHaveText(petHeading);await expect(page.locator('.entitySelectionBar')).toHaveCount(0);
  await capture('app-ux-pet-back');

  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  const menu=page.locator('.actionMenuPanel');
  for(const name of ['홈','사진 기록','내 앨범','일기장','추억','새싹 도감','사람과 반려동물','설정'])await expect(menu.getByRole('button',{name,exact:true})).toBeVisible();
  await capture('app-ux-all-menu');await menu.getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.getByRole('button',{name:'모든 기록',exact:true}).click();
  await page.getByRole('button',{name:'선택',exact:true}).click();
  const tile=page.locator(`.mediaTile[data-media-id="${mediaId}"]`);await tile.click();
  await expect(page.locator('.selectionDock')).toContainText('항목 1개 선택');
  await capture('app-ux-photo-selection');
  await back();await expect(page.locator('.libraryView')).toBeVisible();await expect(page.locator('.selectionDock')).toHaveCount(0);
  if(!await tile.count())for(const button of await page.getByRole('button',{name:/^기록 \d+개 더보기$/}).all())await button.click();
  await tile.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);await tile.click();
  const detail=page.getByRole('dialog',{name:'사진 상세',exact:true}), favorite=detail.getByTitle('즐겨찾기',{exact:true});
  const read=()=>page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('list_media').then(rows=>rows.find(row=>row.id===id).favorite),mediaId);
  const initial=await read();
  await favorite.click();await expect(favorite).toHaveAttribute('aria-pressed',String(!initial));await expect.poll(read).toBe(!initial);
  await favorite.click();await expect(favorite).toHaveAttribute('aria-pressed',String(initial));await expect.poll(read).toBe(initial);
  await capture('app-ux-favorite');await back();await expect(page.locator('.libraryView')).toBeVisible();
  assert.ok(Math.abs((await page.evaluate(()=>scrollY))-scroll)<5,'Closing photo must retain list scroll');

  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();await page.locator('.actionMenuPanel').getByRole('button',{name:'일기장',exact:true}).click();
  await page.getByRole('button',{name:'선택',exact:true}).click();await page.locator('.diaryOpen').first().click();
  await expect(page.locator('.diaryBulk')).toContainText('일기 1편 선택');await capture('app-ux-diary-selection');
  await back();await expect(page.locator('.diaryView')).toBeVisible();await expect(page.locator('.diaryBulk')).toHaveCount(0);

  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();await page.locator('.actionMenuPanel').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();
  await page.getByRole('button',{name:`${pet.name} ${pet.media_ids.length}장`,exact:true}).click();
  return {wholeMenu:true,petSelectionBackKeepsDetail:true,photoSelectionBackKeepsList:true,diarySelectionBackKeepsList:true,favoriteNativePersistence:true,favoriteRestored:true,photoReturnScroll:true,sourceMediaId:mediaId,environment:'Android API 36 x86_64 emulator'};
}
