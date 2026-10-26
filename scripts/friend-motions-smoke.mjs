import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyInstalledFriendMotions({page,captureScreen}) {
  const read=()=>page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('sync_characters'));
  const before=await read();
  const original=before.characters.find(c=>c.isMain);
  const potato=before.characters.find(c=>c.id==='potato');
  assert.ok(original && potato);
  await page.getByRole('button',{name:'친구들 보기',exact:true}).click();
  const card=page.locator('.characterCard:has([data-character="potato"])');
  await card.getByRole('button',{name:'대표로 설정',exact:true}).click();
  await expect(card).toContainText('대표 친구');
  await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();
  const visual=page.locator('.homeMascot .characterVisual');
  await expect(visual).toHaveAttribute('data-character','potato');
  await page.evaluate(()=>{window.friendMotionDrawing=document.querySelector('.homeMascot .characterPortrait image');});
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  for(const [label,motion] of [['함께 산책','walk'],['햇살 선물','treat'],['쓰다듬기','pet'],['함께 놀기','play'],['함께 쉬기','rest']]) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(visual).toHaveAttribute('data-motion',motion);
    assert.equal(await page.evaluate(()=>window.friendMotionDrawing===document.querySelector('.homeMascot .characterPortrait image')),true);
  }
  await expect(page.locator('.homeMascot .characterHeart')).toHaveCount(0);
  assert.equal((await read()).characters.find(c=>c.id==='potato').affection,potato.affection);
  await captureScreen('friend-actions-rest');
  await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('set_main_character',{id}),original.id);
  await page.reload();
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-character',original.id);
  return {fiveDistinctActions:true,drawingPreserved:true,quietRest:true,affectionPreserved:true,originalMainRestored:true,environment:'Android API 36 x86_64 emulator'};
}
