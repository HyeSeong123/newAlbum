import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

// A distinct fixture registration tests UI/storage only, not independent accuracy.
export async function verifyInstalledPetImprovements({page,adb,appId,appDataRoot,originalId,pet,capture,output}) {
 const before=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),originalId);
 const original=before.detections.find(d=>d.pet_id===pet.id);assert.ok(original);
 const local=join(output,'manual-region-fixture.jpg');
 await writeFile(local,Buffer.concat([await readFile('tests/fixtures/pet-dog.jpg'),Buffer.from('gamjassak-manual-region-ui-fixture')]));
 await adb('push',local,'/data/local/tmp/manual-region-fixture.jpg');
 const source=appDataRoot+'/manual-region-fixture.jpg';
 await adb('shell','run-as',appId,'cp','/data/local/tmp/manual-region-fixture.jpg',source);
 const added=await page.evaluate(async path=>window.__TAURI_INTERNALS__.invoke('register_paths',{paths:[path]}),source);
 const item=added.find(row=>row.file_path.endsWith('/manual-region-fixture.jpg'));assert.ok(item);
 await page.reload();await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();await page.getByRole('button',{name:'모든 기록',exact:true}).click();
 while(await page.getByRole('button',{name:/^기록 \d+개 더보기$/}).count())await page.getByRole('button',{name:/^기록 \d+개 더보기$/}).first().click();
 await page.getByRole('button',{name:`${item.file_path.split('/').pop()} 상세보기`,exact:true}).click();
 await page.getByRole('button',{name:'반려동물 직접 추가',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'반려동물 직접 추가',exact:true});
 await editor.getByText('영역 크기 조정',{exact:true}).click();
 for(const [index,label] of ['가로 위치 (%)','세로 위치 (%)','너비 (%)','높이 (%)'].entries())await editor.getByLabel(label,{exact:true}).fill(String(Math.floor(original.box[index]*100)));
 await capture('pet-manual-region-editor');await editor.getByRole('button',{name:'영역 추가',exact:true}).click();await expect(editor).toBeHidden({timeout:120000});
 const read=()=>page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),item.id);
 let scan=await read();assert.equal(scan.detections.length,1);const id=scan.detections[0].id;
 assert.equal(scan.detections[0].detectionSource,'user');assert.equal(scan.detections[0].detectedKind,undefined);assert.equal(scan.detections[0].pet_id,null);
 const card=page.locator('.petDetectionCard');await card.getByRole('button',{name:`${pet.name} 후보 제외`,exact:true}).click();
 await expect.poll(async()=>((await read()).detections[0].rejected_pet_ids??[]).includes(pet.id)).toBe(true);
 await expect(card.getByRole('button',{name:`${pet.name} 선택`,exact:true})).toHaveCount(0);
 await capture('pet-candidate-rejected');await card.getByRole('button',{name:'제외한 후보 다시 보기',exact:true}).click();
 await expect(card.getByRole('button',{name:`${pet.name} 선택`,exact:true})).toBeVisible();
 await card.getByLabel('인식된 반려동물',{exact:true}).selectOption(String(pet.id));await card.getByRole('button',{name:'변경 저장',exact:true}).click();
 await expect.poll(async()=>(await read()).detections[0].pet_id).toBe(pet.id);
 scan=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:id}),originalId);
 assert.equal(scan.detections.find(d=>d.id===original.id).pet_id,pet.id);
 await capture('pet-manual-region-linked');
 await page.getByRole('dialog',{name:'사진 상세',exact:true}).getByTitle('닫기',{exact:true}).click();
 await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('delete_registered_media',{ids:[id]}),item.id);
 await page.reload();await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:`${pet.name} ${pet.media_ids.length}장`,exact:true}).click();
 return {manualRegionUserSource:true,originalDetectionIdPreserved:true,originalPetLinkPreserved:true,candidateRejectedPersistently:true,candidateRestored:true,manualLinkConfirmed:true,independentAccuracyTrial:false,environment:'Android API 36 x86_64 emulator'};
}
