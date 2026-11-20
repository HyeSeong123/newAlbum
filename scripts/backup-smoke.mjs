import { androidAppId, isAndroidManagedMediaPath } from './android-app.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Runs only on the disposable API 36 test installation.
export async function verifyInstalledBackup({ page, adb, tapNative, nativeTree, captureScreen, restart }) {
  assert.match(await adb('get-serialno'), /^emulator-\d+$/);
  const folder = 'GomgomiBackupQA';
  await adb('shell','mkdir','-p','/sdcard/Download/'+folder);
  const root = await adb('shell','run-as',androidAppId,'pwd');
  const relative = 'imported-media-v1/a1b2c3d4e5f60718/backup-test.jpg';
  const managed = root + '/' + relative;
  assert.ok(isAndroidManagedMediaPath(managed));
  const original = '/sdcard/Download/GamjassakSmoke/gamjassak-smoke.jpg';
  const checksum = (await adb('shell','sha256sum',original)).split(/\s/)[0];
  await adb('shell','run-as',androidAppId,'mkdir','-p',relative.slice(0,relative.lastIndexOf('/')));
  await adb('shell',`cat ${original} | run-as ${androidAppId} sh -c 'cat > ${relative}'`);
  const saved = await page.evaluate(async path => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const media = await invoke('register_paths',{paths:[path]});
    const photo = media.find(item=>item.file_path.endsWith('/backup-test.jpg'));
    const album = await invoke('create_album_from_media',{title:'복원 시험 앨범',mediaIds:[photo.id],coverColor:'#B9C58E'});
    localStorage.setItem('geuruteogi.first-run-completed-v1','true');
    localStorage.setItem('oraedameun.dayNotes', JSON.stringify({ '2026-11-20':'기억해요' }));
    await window.__TAURI_INTERNALS__.invoke('save_diary',{entry:{id:0,date:'2026-11-20',title:'백업 시험 일기',body:'복원할 기록',mood:'기쁨',weather:'맑음',album_id:album,photos:[{id:photo.id}]}});
    return {album,photo:photo.id};
  },managed);
  await page.reload();
  const settings = page.getByRole('button',{name:'설정',exact:true}).filter({visible:true});
  if (!(await settings.count())) await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  await settings.click();
  const panel = page.getByRole('region',{name:'기록 백업과 복원'});
  await panel.scrollIntoViewIfNeeded();
  await captureScreen('backup-settings');
  await panel.getByRole('button',{name:'백업에서 복원'}).click();
  await expect.poll(nativeTree,{timeout:30000}).toMatch(/documentsui/);
  await adb('shell','input','keyevent','4');
  await expect(panel.getByRole('status')).toContainText('파일 선택을 취소');
  await panel.getByRole('button',{name:'백업 파일 만들기'}).click();
  await expect.poll(nativeTree,{timeout:30000}).toMatch(/documentsui/);
  let tree = await nativeTree();
  if (!tree.includes('text="'+folder+'"')) {
    if (!tree.includes('text="Download"')) {
      await tapNative(/content-desc="Show roots"|content-desc="Open navigation drawer"/i);
      await tapNative(/text="Downloads"/);
    } else { await tapNative(/text="Download"/); }
  }
  await tapNative(/text="GomgomiBackupQA"/);
  await tapNative(/text="USE THIS FOLDER"/i);
  await tapNative(/text="ALLOW"/i);
  await expect(panel.getByRole('status')).toContainText('백업 파일을 저장',{timeout:60000});
  await page.evaluate(async () => {
    localStorage.setItem('oraedameun.dayNotes','{}');
    await window.__TAURI_INTERNALS__.invoke('save_diary',{entry:{id:0,date:'2026-11-20',title:'백업 이후의 시험 일기',body:'',mood:'평온',weather:'맑음',album_id:null,photos:[]}});
  });
  await adb('shell',`head -c 12 /sdcard/Download/${folder}/*.gomgomi > /sdcard/Download/${folder}/broken.gomgomi`);
  await panel.getByRole('button',{name:'백업에서 복원'}).click();
  await tapNative(/text="broken\.gomgomi"/);
  await expect(panel.getByRole('status')).toContainText('끝까지 저장되지 않았습니다');
  async function preview() {
    await panel.getByRole('button',{name:'백업에서 복원'}).click();
    await tapNative(/text="곰고미-[0-9]+\.gomgomi"/);
    const dialog = page.getByRole('dialog',{name:'백업으로 기록을 바꿀까요?'});
    await expect(dialog).toBeVisible();
    const cells=await dialog.getByRole('row',{name:/일기/}).getByRole('cell').allTextContents();
    assert.equal(Number(cells[0])-Number(cells[1]),1);
    return dialog;
  }
  let dialog=await preview();
  await captureScreen('backup-restore-preview');
  await dialog.getByRole('button',{name:'현재 기록 유지'}).click();
  await expect(panel.getByRole('status')).toContainText('현재 기록을 유지');
  dialog=await preview();
  await dialog.getByRole('button',{name:'앱 닫고 복원'}).click();
  const result=await restart();
  const restored=await result.page.evaluate(async () => ({
    diaries:await window.__TAURI_INTERNALS__.invoke('list_diary'),
    memo:JSON.parse(localStorage.getItem('oraedameun.dayNotes')||'{}')['2026-11-20'],
  }));
  const diary = restored.diaries.find(d=>d.title==='백업 시험 일기');
  assert.equal(diary.album_id,saved.album);
  assert.deepEqual(diary.photos.map(p=>p.id),[saved.photo]);
  assert.ok(!restored.diaries.some(d=>d.title==='백업 이후의 시험 일기'));
  assert.equal((await adb('shell','run-as',androidAppId,'sha256sum',relative)).split(/\s/)[0],checksum);
  assert.equal((await adb('shell','sha256sum',original)).split(/\s/)[0],checksum);
  assert.equal(restored.memo,'기억해요');
  return result;
}
