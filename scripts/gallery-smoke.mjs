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
  await adb('shell','mkdir','-p','/sdcard/Pictures/GamjassakGallery');
  const fixtures = [
    {name:'A-old-gallery.jpg',source:'tests/fixtures/no-gps.jpg',date:'202401010900.00'},
    {name:'Z-new-gallery.jpg',source:'tests/fixtures/pet-dog.jpg',date:'202509010900.00'},
    {name:'M-video-gallery.mp4',source:'tests/fixtures/playback.mp4',date:'202609010900.00'},
  ];
  const scrollFixtures = Array.from({length:33}, (_, index) => ({name:`scroll-${String(index).padStart(2,'0')}.jpg`,source:'tests/fixtures/no-gps.jpg',date:'202301010900.00'}));
  for (const file of [...fixtures, ...scrollFixtures]) {
    const path = `/sdcard/Pictures/GamjassakGallery/${file.name}`;
    await adb('push',resolve(file.source),path);
    await adb('shell','touch','-t',file.date,path);
    await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d',`file://${path}`);
  }
  const unsupported = join(output,'unsupported-gallery.gif');
  await writeFile(unsupported,Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64'));
  await adb('push',resolve(unsupported),'/sdcard/Pictures/GamjassakGallery/unsupported-gallery.gif');
  await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Pictures/GamjassakGallery/unsupported-gallery.gif');
  await expect.poll(async () => {
    // A fresh MediaProvider can publish the filename before MIME classification
    // finishes. The app intentionally filters pending/trash/non-media entries.
    const rows=await adb('shell','content','query','--uri','content://media/external/file','--projection','_display_name:date_modified:media_type:is_pending:is_trashed');
    await writeFile(join(output,'gallery-media-store.txt'),rows);
    return [...fixtures, ...scrollFixtures].every(file=>rows.split('\n').some(row=>row.includes(file.name) && /media_type=(1|3)(,|$)/.test(row) && row.includes('is_pending=0') && row.includes('is_trashed=0')))
      && rows.includes('unsupported-gallery.gif');
  },{timeout:60_000}).toBe(true);
  await launch();
  // Exercise a real full-access permission choice after denial. A shell grant
  // alone can leave Android's selected-photo AppOps session out of sync.
  await tapNative(/resource-id="com.android.permissioncontroller:id\/permission_allow(?:_all)?_button"/);
  let tree;
  await expect.poll(async()=>{
    tree=await nativeTree();return fixtures.every(file=>tree.includes(file.name));
  },{timeout:60_000}).toBe(true);
  const order=['M-video-gallery.mp4','Z-new-gallery.jpg','A-old-gallery.jpg'];
  assert.ok(tree.indexOf(order[0])<tree.indexOf(order[1]) && tree.indexOf(order[1])<tree.indexOf(order[2]),'Gallery must order by modified time rather than filename');
  assert.ok(!tree.includes('com.google.android.documentsui'),'Gallery cannot launch the file browser');
  assert.ok(!tree.includes('unsupported-gallery.gif'),'Unsupported formats must not be offered for import');
  assert.ok(tree.includes('사진·영상 선택') && tree.includes('사진·영상을 골라 주세요'), 'Gallery must show a clear selection heading and footer');
  await captureScreen('gallery-recent-modified');
  const centers = xml => order.map(name => {
    const node = (xml.match(/<node\b[^>]+>/g) ?? []).find(node => node.includes(`content-desc="${name},`));
    assert.ok(node, `Missing gesture fixture: ${name}`);
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
    return [Math.round((bounds[0]+bounds[2])/2), Math.round((bounds[1]+bounds[3])/2)];
  });
  const beforeScroll = centers(tree);
  await adb('shell','input','swipe',String(beforeScroll[0][0]),String(beforeScroll[0][1]+400),String(beforeScroll[0][0]),String(beforeScroll[0][1]),'250');
  const scrolled = await nativeTree();
  assert.ok(scrolled.includes('사진·영상을 골라 주세요'), 'Normal scrolling must not select images');
  assert.ok(!scrolled.includes(order[0]) || centers(scrolled)[0][1] < beforeScroll[0][1] - 100, 'Normal swipe must move gallery cells while leaving selection unchanged');
  await adb('shell','input','swipe',String(beforeScroll[0][0]),String(beforeScroll[0][1]),String(beforeScroll[0][0]),String(beforeScroll[0][1]+1000),'300');
  await expect.poll(async () => (await nativeTree()).includes(order[0])).toBe(true);
  // Use one visible row for the gesture: dated fixtures can start in the
  // middle of a row when the device already contains newer photos.
  const gestureTree = await nativeTree();
  const points = (gestureTree.match(/<node\b[^>]+>/g) ?? []).filter(node => /content-desc="[^"]+, (사진|영상), 수정 /.test(node)).slice(0,3).map(node => {
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
    return [Math.round((bounds[0]+bounds[2])/2),Math.round((bounds[1]+bounds[3])/2)];
  });
  assert.equal(points.length,3); assert.ok(points.every(point=>point[1]===points[0][1]), 'Gesture fixtures must share a visible row');
  async function dragSelection() {
    await adb('shell','input','motionevent','DOWN',...points[0].map(String));
    await new Promise(resolve=>setTimeout(resolve,800));
    for (let segment=1;segment<points.length;segment++) {
      for (let step=1;step<=8;step++) {
        const start=points[segment-1], end=points[segment];
        await adb('shell','input','motionevent','MOVE',String(Math.round(start[0]+(end[0]-start[0])*step/8)),String(Math.round(start[1]+(end[1]-start[1])*step/8)));
      }
    }
    await adb('shell','input','motionevent','UP',...points.at(-1).map(String));
  }
  await dragSelection();
  assert.ok((await nativeTree()).includes('3개 선택됨'), 'Long press then drag must select each crossed cell once');
  await dragSelection();
  assert.ok((await nativeTree()).includes('사진·영상을 골라 주세요'), 'Long pressing a selected photo must drag to deselect');
  for (const name of order) await tapNative(new RegExp(`content-desc="${name.replaceAll('.','\\.')}[^\"]*선택 안 됨`));
  assert.ok((await nativeTree()).includes('3개 선택됨'), 'Selection count must update above the import action');
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
  const report={gallery:true,longPressDragSelects:true,longPressDragDeselects:true,ordinarySwipeScrollsWithoutSelection:true,sort:'date_modified DESC, _id DESC',order,photoCount:2,videoCount:1,unsupportedFormatsHidden:true,deniedPermissionCancels:true,cancelLeavesRecordsUnchanged:true};
  await writeFile(join(output,'gallery-smoke.json'),JSON.stringify(report,null,2));
  console.log('Native gallery sorting, image/video multi-selection, denial, cancellation and Rust import: OK');
}
