import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// A real imported dog photo intentionally has zero human faces. This tests
// manual membership and fresh analysis, not a human identity accuracy claim.
export async function verifyInstalledManualPhotos(page, mediaId, pet, capture) {
  await page.getByRole('button', { name:'사람과 반려동물', exact:true }).click();
  await page.getByRole('tab', { name:'사람', exact:true }).click();
  await page.getByRole('button', { name:'사진 직접 등록', exact:true }).click();
  const dialog=page.getByRole('dialog', { name:'사람 직접 등록', exact:true });
  await dialog.getByLabel('등록할 이름').fill('직접 등록 검증');
  await dialog.locator(`[data-selection-id="${mediaId}"]`).click();
  await dialog.getByRole('button', { name:'사진 저장', exact:true }).click();
  await expect(dialog).toBeHidden();
  const read=()=>page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_face_index'));
  const registered=(await read()).people.find(person=>person.name==='직접 등록 검증');
  assert.ok(registered);assert.deepEqual(registered.media_ids,[mediaId]);
  await expect(page.locator('.peopleView > .entityHeader').getByText('사진 1장', { exact:true })).toBeVisible();
  await expect(page.locator('.peopleView .personMediaGrid').getByRole('button', { name:'사진 상세보기',exact:true })).toHaveCount(1);
  await capture('manual-person-registration');
  await page.evaluate(()=>{window.manualPersonDiagnostics=0;window.addEventListener('gamjassak-person-diagnostics',()=>window.manualPersonDiagnostics++);});
  await page.getByRole('button', { name:'등록 사진 다시 분석', exact:true }).click();
  await expect(page.locator('.peopleView .faceProgress')).toContainText('얼굴 못 찾음 1장', { timeout:120_000 });
  assert.ok(await page.evaluate(()=>window.manualPersonDiagnostics>0));
  const next=await read();assert.deepEqual(next.people.find(person=>person.id===registered.id).media_ids,[mediaId]);assert.ok(!next.faces.some(face=>face.person_id===registered.id));
  await capture('manual-person-relearning-no-face');

  await page.getByRole('tab', { name:'반려동물',exact:true }).click();
  const header=page.locator('.petsView > .entityHeader');
  if(await header.getByRole('heading').innerText()!==pet.name) await page.locator('.petsView .petGrid').getByRole('button').filter({hasText:pet.name}).first().click();
  const before=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),mediaId);
  const dog=before.detections.find(row=>row.pet_id===pet.id);assert.ok(dog);
  await page.getByRole('button', { name:'이름·사진 수정',exact:true }).click();
  const picker=page.getByRole('dialog', { name:'반려동물 편집',exact:true });
  await expect(picker.locator(`[data-selection-id="${mediaId}"]`)).toHaveAttribute('aria-pressed','true');
  await picker.getByRole('button', { name:'저장',exact:true }).click();await expect(picker).toBeHidden();
  const count=await page.evaluate(()=>window.petDiagnostics.length);
  await page.getByRole('button', { name:'반려동물 관리',exact:true }).click();
  await page.getByRole('button', { name:'등록 사진 다시 분석',exact:true }).click();
  await expect(page.locator('.petsView .petAnalysisNotice')).toContainText('다시 분석 완료', { timeout:120_000 });
  assert.ok(await page.evaluate(before=>window.petDiagnostics.length>before,count));
  const after=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),mediaId);
  const kept=after.detections.find(row=>row.id===dog.id);assert.equal(kept.pet_id,pet.id);assert.equal(kept.view,dog.view);assert.equal(kept.viewSource,dog.viewSource);
  assert.deepEqual((await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_pets'))).find(row=>row.id===pet.id).media_ids,pet.media_ids);
  await capture('pet-registered-photo-relearning');
  return {personId:registered.id,mediaId,manualPhotoWithoutFace:true,freshPersonInference:true,freshPetInference:true,petObjectIdPreserved:true,photoLinksPreserved:true};
}
