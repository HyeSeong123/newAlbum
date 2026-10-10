import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function verifyInstalledGallery({page,adb,nativeTree,tapNative,captureScreen,output}) {
  const appId = 'com.oraedameun.album';
  const launch = () => page.evaluate(() => {
    window.galleryPick = { done:false };
    window.__TAURI_INTERNALS__.invoke('choose_android_gallery')
      .then(uris => window.galleryPick = {done:true,uris})
      .catch(error => window.galleryPick = {done:true,error:String(error)});
  });
  const wait = async () => {
    await expect.poll(() => page.evaluate(() => window.galleryPick.done), {timeout:60_000}).toBe(true);
    const result = await page.evaluate(() => window.galleryPick);
    assert.ok(!result.error,result.error); return result;
  };
  await launch();
  await tapNative(/resource-id="com.android.permissioncontroller:id\/permission_deny_button"/);
  await expect.poll(nativeTree).toMatch(/최근 수정 순/);
  await captureScreen('gallery-permission-denied');
  await tapNative(/text="취소"/);
  assert.equal((await wait()).uris,null);
  for (const permission of ['READ_MEDIA_IMAGES','READ_MEDIA_VIDEO']) await adb('shell','pm','grant',appId,`android.permission.${permission}`);
  await adb('shell','mkdir','-p','/sdcard/Pictures/GamjassakGallery');
  const fixtures = [
    {name:'A-old-gallery.jpg',source:'tests/fixtures/no-gps.jpg',date:'202401010900.00'},
    {name:'Z-new-gallery.jpg',source:'tests/fixtures/pet-dog.jpg',date:'202509010900.00'},
    {name:'M-video-gallery.mp4',source:'tests/fixtures/playback.mp4',date:'202609010900.00'},
  ];
  for (const file of fixtures) {
    const path = `/sdcard/Pictures/GamjassakGallery/${file.name}`;
    await adb('push',resolve(file.source),path);
    await adb('shell','touch','-t',file.date,path);
    await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d',`file://${path}`);
  }
  await expect.poll(async () => {
    const rows=await adb('shell','content','query','--uri','content://media/external/file','--projection','_display_name:date_modified');
    return fixtures.every(file=>rows.includes(file.name));
  }).toBe(true);
  await launch();
  let tree;
  await expect.poll(async()=>{
    tree=await nativeTree();return fixtures.every(file=>tree.includes(file.name));
  }).toBe(true);
  const order=['M-video-gallery.mp4','Z-new-gallery.jpg','A-old-gallery.jpg'];
  assert.ok(tree.indexOf(order[0])<tree.indexOf(order[1]) && tree.indexOf(order[1])<tree.indexOf(order[2]),'Gallery must order by modified time rather than filename');
  assert.ok(!tree.includes('com.google.android.documentsui'),'Gallery cannot launch the file browser');
  await captureScreen('gallery-recent-modified');
  for (const name of order) await tapNative(new RegExp(`content-desc="${name.replaceAll('.','\\.')}[^\"]*선택 안 됨`));
  await captureScreen('gallery-three-selected');
  await tapNative(/text="3개 가져오기"/);
  const selected=await wait();assert.equal(selected.uris.length,3);
  assert.ok(selected.uris.every(uri=>/^content:\/\/media\/external\/(images|video)\/media\/\d+$/.test(uri)));
  const imported=await page.evaluate(paths=>window.__TAURI_INTERNALS__.invoke('register_paths',{paths}),selected.uris);
  const records=imported.filter(row=>fixtures.some(file=>row.file_path.endsWith(file.name)));
  assert.equal(records.length,3);assert.equal(records.filter(row=>row.file_type==='video').length,1);
  await page.evaluate(ids=>window.__TAURI_INTERNALS__.invoke('delete_registered_media',{ids}),records.map(row=>row.id));
  await launch();await tapNative(/text="취소"/);assert.equal((await wait()).uris,null);
  await page.reload();
  const report={gallery:true,sort:'date_modified DESC, _id DESC',order,photoCount:2,videoCount:1,deniedPermissionCancels:true,cancelLeavesRecordsUnchanged:true};
  await writeFile(join(output,'gallery-smoke.json'),JSON.stringify(report,null,2));
  console.log('Native gallery sorting, image/video multi-selection, denial, cancellation and Rust import: OK');
}
