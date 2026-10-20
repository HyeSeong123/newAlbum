import { expect } from '@playwright/test';
import { _android as android } from 'playwright';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyInstalledGallery } from './gallery-smoke.mjs';
const run=promisify(execFile),output='test-results/android-smoke',appId='com.oraedameun.album';
const adb=async(...args)=>(await run('adb',args,{timeout:60000,maxBuffer:8*1024*1024})).stdout.trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function apkFiles(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await apkFiles(p));else if(p.endsWith('.apk'))out.push(p);}return out;}
async function captureScreen(name){await adb('shell','screencap','-p','/sdcard/audit-screen.png');await adb('pull','/sdcard/audit-screen.png',join(output,name+'.png'));}
let device,context,page,workers=0;const modelRequests=[];
async function connect(){
 device=(await android.devices({omitDriverInstall:true})).find(d=>d.serial().startsWith('emulator-'));assert.ok(device);
 const view=await device.webView({pkg:appId},{timeout:60000});page=await view.page();context=page.context();context.setDefaultTimeout(45000);
 await expect.poll(async()=>{for(const p of context.pages().reverse()){if(await p.locator('main.app .navList').isVisible().catch(()=>false)){page=p;return true;}}return false;},{timeout:60000}).toBe(true);
 page.on('worker',()=>workers++);page.on('request',r=>{if(/\/models\/|tfjs|face-api|onnxruntime/.test(r.url()))modelRequests.push(r.url());});
}
async function disconnect(){if(context)await context.close();context=undefined;if(device)await device.close();device=undefined;}
async function nativeTree() {
  const status = await adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window.xml');
  await appendFile(join(output, 'uiautomator.txt'), `${status}\n`);
  // First launch of DocumentsUI can still be loading its providers. ADB may
  // return success with "could not get idle state" and no hierarchy file.
  if (!/dumped to:/i.test(status)) return '';
  const xml = await adb('shell', 'cat', '/sdcard/window.xml');
  await writeFile(join(output, 'native-picker.xml'), xml);
  assert.ok(!xml.includes('unregistered ActivityResultLauncher'), 'Android activity result launcher was not restored');
  return xml;
}
async function nativeNode(label, timeout = 60_000) {
  const start = Date.now();
  do {
    const nodes = (await nativeTree()).match(/<node\b[^>]+>/g) ?? [];
    const node = nodes.find(node => label.test(node));
    if (node) return node;
    await pause(300);
  } while (Date.now() - start < timeout);
  throw new Error(`Native picker entry was missing: ${label}`);
}
async function tapNative(label) {
  // Permission sheets can still be sliding while uiautomator reports their
  // controls. A coordinate from that frame can miss the settled button. Wait
  // for two matching snapshots, rather than treating a dispatched tap as a click.
  let previous;
  const deadline = Date.now() + 60_000;
  do {
    const bounds = (await nativeNode(label)).match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(bounds, 'Native picker control must have screen bounds');
    if (previous === bounds[0]) {
      await adb('shell', 'input', 'tap', String(Math.floor((+bounds[1] + +bounds[3]) / 2)), String(Math.floor((+bounds[2] + +bounds[4]) / 2)));
      return;
    }
    previous = bounds[0];
    await pause(300);
  } while (Date.now() < deadline);
  throw new Error(`Native picker control did not settle: ${label}`);
}

await mkdir(output,{recursive:true});
try{
 const apk=(await apkFiles('src-tauri/gen/android/app/build/outputs/apk')).find(p=>/x86[_-]64/i.test(p));assert.ok(apk);
 await adb('install','-r',apk);await adb('shell','am','start','-W','-n',`${appId}/.MainActivity`);await connect();
 await page.evaluate(()=>localStorage.setItem('geuruteogi.first-run-completed-v1','true'));await page.reload();
 const policy=await page.evaluate(()=>fetch(new URL('/notices/ai-release-status.json',location.href)).then(r=>r.json()));
 assert.equal(policy.activeModelProfile,'manual-only-no-models');assert.equal(policy.trainedWeightsIncluded,false);assert.equal(policy.modelRuntimeEnabled,false);
 await verifyInstalledGallery({page,adb,nativeTree,tapNative,captureScreen,output});
 const rows=await adb('shell','content','query','--uri','content://media/external/images/media','--projection','_id:_display_name');
 const photoId=rows.match(/_id=(\d+), _display_name=Z-new-gallery\.jpg/);assert.ok(photoId,rows);
 const media=await page.evaluate(paths=>window.__TAURI_INTERNALS__.invoke('register_paths',{paths}),[`content://media/external/images/media/${photoId[1]}`]);assert.equal(media.length,1);
 const mediaId=media[0].id;
 const ids=await page.evaluate(async mediaId=>({
  person:await window.__TAURI_INTERNALS__.invoke('save_manual_person_photos',{personId:null,name:'직접 등록 검증',mediaIds:[mediaId]}),
  pet:await window.__TAURI_INTERNALS__.invoke('save_pet',{id:null,name:'수동 보리',mediaIds:[mediaId],coverMediaId:mediaId})
 }),mediaId);
 await page.reload();await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('button',{name:'직접 등록 검증 1장',exact:true}).click();
 await expect(page.getByRole('button',{name:'등록 사진 다시 분석',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'사진 직접 등록',exact:true})).toBeEnabled();await captureScreen('manual-only-person');
 await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'수동 보리 1장',exact:true}).click();
 await expect(page.getByRole('button',{name:'등록된 사진에서 찾기',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'반려동물 편집',exact:true});await editor.getByLabel('이름',{exact:true}).fill('보리 이름 수정');await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor).toBeHidden();await captureScreen('manual-only-pet');
 await page.getByRole('button',{name:'사진 상세보기',exact:true}).first().click();await expect(page.getByRole('heading',{name:'사진 정보',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/분석|후보 비교|사진에서 찾기/})).toHaveCount(0);await captureScreen('manual-only-photo');
 const before=await page.evaluate(async()=>({people:await window.__TAURI_INTERNALS__.invoke('list_face_index'),pets:await window.__TAURI_INTERNALS__.invoke('list_pets')}));
 await disconnect();await adb('shell','am','force-stop',appId);await adb('shell','am','start','-W','-n',`${appId}/.MainActivity`);await connect();
 const after=await page.evaluate(async()=>({people:await window.__TAURI_INTERNALS__.invoke('list_face_index'),pets:await window.__TAURI_INTERNALS__.invoke('list_pets')}));
 assert.deepEqual(after,before);assert.deepEqual(after.people.people.find(p=>p.id===ids.person).media_ids,[mediaId]);assert.deepEqual(after.pets.find(p=>p.id===ids.pet).media_ids,[mediaId]);
 assert.equal(workers,0);assert.deepEqual(modelRequests,[]);
 await captureScreen('manual-only-after-restart');
 await writeFile(join(output,'manual-only-smoke.json'),JSON.stringify({environment:'Android API36 x86_64 emulator',profile:policy.activeModelProfile,personId:ids.person,petId:ids.pet,mediaId,idsAndLinksPreserved:true,restartPreserved:true,workers,modelRequests},null,2));
 console.log('Manual-only Android: native gallery, person/pet editing, restart retention and no inference verified.');
}catch(error){await writeFile(join(output,'failure.txt'),error.stack??String(error));await captureScreen('failure').catch(()=>{});throw error;}
finally{await disconnect();}
