import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';

// A real imported dog photo intentionally has zero human faces. This tests
// manual membership plus explicit unknown-face review, not identity accuracy.
export async function verifyInstalledManualPhotos(page, mediaId, pet, capture) {
  await page.getByRole('button', { name:'사람과 반려동물', exact:true }).click();
  await page.getByRole('tab', { name:'인물', exact:true }).click();
  await page.getByRole('button', { name:'인물 추가', exact:true }).click();
  const dialog=page.getByRole('dialog', { name:'인물 추가', exact:true });
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
  await expect(page.getByRole('button', { name:'인식 기준 갱신', exact:true })).toHaveCount(0);
  // Use an actual packaged human-photo fixture through the existing SAF tree
  // grant. This verifies the installed UI/SQLite contract, not identity accuracy.
  await promisify(execFile)('adb',['push',resolve('node_modules/@vladmandic/face-api/demo/sample1.jpg'),'/sdcard/Download/GamjassakGPS/person-smoke.jpg'],{timeout:60_000,maxBuffer:1024*1024});
  const uri='content://com.android.externalstorage.documents/tree/primary%3ADownload%2FGamjassakGPS/document/primary%3ADownload%2FGamjassakGPS%2Fperson-smoke.jpg';
  const imported=await page.evaluate(uri=>window.__TAURI_INTERNALS__.invoke('register_paths',{paths:[uri]}),uri);
  // register_paths returns the complete library, including the earlier dog
  // and video fixtures; isolate the newly imported test photo by its name.
  const facePhoto=imported.find(item=>item.file_path.endsWith('/person-smoke.jpg'));
  assert.ok(facePhoto);const faceMediaId=facePhoto.id;
  await page.reload();await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.locator('.peopleView .entityQuickActions').getByRole('button',{name:'새 사진에서 사람 찾기',exact:true}).click();
  await expect(page.locator('.peopleView .faceProgress')).toContainText('사진 1장을 확인했습니다.',{timeout:120_000});
  const beforeNaming=await read();const unknown=beforeNaming.faces.filter(face=>face.media_id===faceMediaId);
  assert.equal(unknown.length,3);assert.ok(unknown.every(face=>!face.confirmed));
  await page.getByRole('button',{name:'미확인 인물 다시 확인',exact:true}).click();
  let review=page.getByRole('dialog',{name:'미확인 인물 다시 확인',exact:true});
  await expect(review.getByRole('checkbox')).toHaveCount(3);
  const selectedId=unknown[0].id;
  await review.getByLabel(`미확인 얼굴 ${selectedId} 선택`,{exact:true}).check();
  await review.getByRole('button',{name:'이름 지정',exact:true}).click();
  const naming=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await naming.getByRole('button',{name:'새 인물',exact:true}).click();
  await naming.getByLabel('새 인물 이름').fill('얼굴 선택 검증');
  await naming.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(naming).toBeHidden();
  const named=await read();const added=named.people.find(person=>person.name==='얼굴 선택 검증');assert.ok(added);
  assert.ok(named.faces.some(face=>face.id===selectedId&&face.person_id===added.id&&face.confirmed));
  assert.deepEqual(named.people.find(person=>person.id===registered.id).media_ids,[mediaId]);
  await capture('selected-face-new-person');
  await promisify(execFile)('adb',['shell','input','keyevent','4']);
  await expect(page.locator('.peopleView h2')).toHaveText('미확인 인물');
  await expect(page.locator('.entitySelectionBar')).toHaveCount(0);
  await page.getByRole('button',{name:'인물별 보기',exact:true}).click();
  await page.getByRole('button',{name:'미확인 인물 다시 확인',exact:true}).click();
  review=page.getByRole('dialog',{name:'미확인 인물 다시 확인',exact:true});
  await expect(review.getByRole('checkbox')).toHaveCount(2);
  await expect(review.getByLabel(`미확인 얼굴 ${selectedId} 선택`,{exact:true})).toHaveCount(0);
  assert.deepEqual((await read()).faces,named.faces);
  await capture('unconfirmed-faces-only');await review.getByTitle('닫기',{exact:true}).click();
  await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('delete_registered_media',{ids:[id]}),faceMediaId);
  await page.reload();await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();

  await page.getByRole('tab', { name:'반려동물',exact:true }).click();
  const header=page.locator('.petsView > .entityHeader');
  if(await header.getByRole('heading').innerText()!==pet.name) await page.locator('.petsView .petGrid').getByRole('button').filter({hasText:pet.name}).first().click();
  const before=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),mediaId);
  const dog=before.detections.find(row=>row.pet_id===pet.id);assert.ok(dog);
  await page.getByRole('button', { name:'반려동물 관리',exact:true }).click();
  await page.getByRole('button', { name:'이름·사진 수정',exact:true }).click();
  const picker=page.getByRole('dialog', { name:'반려동물 편집',exact:true });
  await expect(picker.locator(`[data-selection-id="${mediaId}"]`)).toHaveAttribute('aria-pressed','true');
  await picker.getByRole('button', { name:'저장',exact:true }).click();await expect(picker).toBeHidden();
  const count=await page.evaluate(()=>window.petDiagnostics.length);
  await page.getByRole('button', { name:'반려동물 관리',exact:true }).click();
  await page.getByRole('button', { name:'인식 기준 갱신',exact:true }).click();
  await expect(page.locator('.petsView .petAnalysisNotice')).toContainText('다시 분석 완료', { timeout:120_000 });
  assert.ok(await page.evaluate(before=>window.petDiagnostics.length>before,count));
  const after=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),mediaId);
  const kept=after.detections.find(row=>row.id===dog.id);assert.equal(kept.pet_id,pet.id);assert.equal(kept.view,dog.view);assert.equal(kept.viewSource,dog.viewSource);
  assert.deepEqual((await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_pets'))).find(row=>row.id===pet.id).media_ids,pet.media_ids);
  await capture('pet-registered-photo-relearning');
  return {personId:registered.id,mediaId,manualPhotoWithoutFace:true,unknownOnlyReview:true,selectedFaceRegistration:true,freshPetInference:true,petObjectIdPreserved:true,photoLinksPreserved:true};
}
