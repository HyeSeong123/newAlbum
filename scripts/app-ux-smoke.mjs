import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Real installed WebView actions and SQLite calls; no mocked IPC or app-only test APIs.
export async function verifyInstalledAppUx(page, mediaId, pet, back, captureNative) {
  async function capture(name) {
    // DOM assertions can finish before Android's compositor presents the frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await new Promise(resolve => setTimeout(resolve, 200));
    await captureNative(name);
  }
  const petHeading=await page.locator('.petsView h2').innerText();
  await page.getByRole('button',{name:'감자싹 홈으로 이동',exact:true}).click();
  await expect(page.locator('.homeShortcuts > button')).toHaveCount(4);
  const homePeople=page.getByRole('button',{name:'사람과 반려동물 열기',exact:true});
  await homePeople.scrollIntoViewIfNeeded();await capture('app-ux-home-people');await homePeople.click();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();
  await page.getByRole('button',{name:`${pet.name} ${pet.media_ids.length}장`,exact:true}).click();
  await page.getByRole('button',{name:'현재 화면 도움말',exact:true}).click();
  const guide=page.getByRole('dialog',{name:'버튼 도움말',exact:true});
  await expect(guide.getByRole('heading',{name:'인물',exact:true})).toBeVisible();
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'반려동물',exact:true})).toBeVisible();
  assert.equal(await page.locator('[data-help-highlighted]').getAttribute('id'),'people-tab-1');
  await capture('app-ux-pet-help');await back();await expect(guide).toHaveCount(0);
  await expect(page.locator('.petsView h2')).toHaveText(petHeading);

  await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('button',{name:'사진 선택',exact:true}).first().click();
  await expect(page.locator('.entitySelectionBar')).toContainText('사진 1개 선택');
  await back();await expect(page.locator('.petsView h2')).toHaveText(petHeading);await expect(page.locator('.entitySelectionBar')).toHaveCount(0);
  await capture('app-ux-pet-back');

  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  const menu=page.locator('.actionMenuPanel');
  for(const name of ['홈','사진 기록','내 앨범','일기장','추억','새싹 도감','사람과 반려동물','설정']) {const destination=menu.getByRole('button',{name,exact:true});await expect(destination).toBeVisible();await expect(destination.locator('svg')).toHaveCount(1);}
  await capture('app-ux-all-menu');await menu.getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.getByRole('button',{name:'모든 기록',exact:true}).click();
  const nativeRows=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_media'));
  for(const [value,field,ascending] of [['registered-desc','created_at',false],['registered-asc','created_at',true],['rating','rating',false]]) {
    await page.getByLabel('정렬 기준',{exact:true}).selectOption(value);
    const ids=await page.locator('.mediaTile').evaluateAll(tiles=>tiles.map(tile=>Number(tile.dataset.mediaId)));
    const rows=ids.map(id=>nativeRows.find(row=>row.id===id));
    for(let i=1;i<rows.length;i++) assert.ok(ascending ? rows[i-1][field]<=rows[i][field] : rows[i-1][field]>=rows[i][field],`${value} must preserve actual native ${field} order`);
  }
  await capture('app-ux-registration-sort');
  await page.getByLabel('정렬 기준',{exact:true}).selectOption('date-desc');
  await page.getByRole('button',{name:'선택',exact:true}).click();
  const tile=page.locator(`.mediaTile[data-media-id="${mediaId}"]`);await tile.click();
  await expect(page.locator('.selectionDock')).toContainText('항목 1개 선택');
  await capture('app-ux-photo-selection');
  await page.getByRole('button',{name:'현재 화면 도움말',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'버튼 도움말',exact:true})).toBeVisible();
  await capture('app-ux-selection-help');await back();
  await expect(page.getByRole('dialog',{name:'버튼 도움말',exact:true})).toHaveCount(0);
  await expect(page.locator('.selectionDock')).toContainText('항목 1개 선택');

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
  return {homePeopleShortcut:true,helpScopedToCurrentFeature:true,helpBackKeepsSelection:true,wholeMenu:true,menuDestinationIcons:true,registrationAndRatingSort:true,petSelectionBackKeepsDetail:true,photoSelectionBackKeepsList:true,diarySelectionBackKeepsList:true,favoriteNativePersistence:true,favoriteRestored:true,photoReturnScroll:true,sourceMediaId:mediaId,environment:'Android API 36 x86_64 emulator'};
}
