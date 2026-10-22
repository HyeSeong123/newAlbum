import { test, expect, type Page } from '@playwright/test';
import { auditLibrary } from './audit-fixture';

async function go(page:Page, name:string) { await page.locator('.navList').getByRole('button',{name,exact:true}).click(); }
async function back(page:Page) { await page.keyboard.press('Escape'); }

test('photo selection actions stay reachable and Back cancels the mode before leaving',async({page})=>{
  await auditLibrary(page);await go(page,'사진 기록');await page.getByRole('button',{name:'선택',exact:true}).click();
  const bar=page.getByRole('region',{name:'선택한 항목 관리'});
  await page.locator('.mediaTile').first().click();await expect(bar).toContainText('항목 1개 선택');
  await bar.getByRole('button',{name:'현재 결과 전체 선택 (200개)',exact:true}).click();
  await expect(bar).toContainText('항목 200개 선택');
  await bar.getByRole('button',{name:'현재 결과 전체 선택 (200개)',exact:true}).click();
  await expect(bar).toContainText('항목 200개 선택');
  await bar.getByRole('button',{name:'선택 해제',exact:true}).click();await expect(bar).toContainText('항목 0개 선택');
  await expect(bar.getByRole('button',{name:'등록 해제',exact:true})).toBeDisabled();
  await page.locator('.mediaTile').first().click();await back(page);
  await expect(page.locator('.libraryView')).toBeVisible();await expect(bar).toHaveCount(0);
  await expect(page.getByRole('button',{name:'선택',exact:true})).toBeVisible();
});

test('Android back and visible cancel retain the current person and pet detail',async({page,isMobile})=>{
  test.skip(!isMobile,'Android bridge requires the Android user agent.');
  await auditLibrary(page);await go(page,'사람과 반려동물');
  await page.getByRole('button',{name:'가족 24장',exact:true}).click();
  await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('button',{name:'사진 선택',exact:true}).first().click();
  expect(await page.evaluate(()=>window.__gamjassakBack?.())).toBe(true);
  await expect(page.locator('.peopleView h2')).toHaveText('가족');await expect(page.locator('.entitySelectionBar')).toHaveCount(0);
  await page.getByRole('button',{name:'인물 관리',exact:true}).click();
  await page.evaluate(()=>window.__gamjassakBack?.());await expect(page.locator('.actionMenuPanel')).toHaveCount(0);
  await expect(page.locator('.peopleView h2')).toHaveText('가족');
  await page.evaluate(()=>window.__gamjassakBack?.());await expect(page.locator('.peopleView h2')).toHaveText('인물');
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'보리 1장',exact:true}).click();
  await page.getByRole('button',{name:'선택',exact:true}).click();await page.evaluate(()=>window.__gamjassakBack?.());
  await expect(page.locator('.petsView h2')).toHaveText('보리');await expect(page.locator('.entitySelectionBar')).toHaveCount(0);
  await page.evaluate(()=>window.__gamjassakBack?.());await expect(page.locator('.petsView h2')).toHaveText('반려동물');
  await page.getByRole('button',{name:'미확인 반려동물',exact:true}).click();await page.evaluate(()=>window.__gamjassakBack?.());
  await expect(page.locator('.petsView h2')).toHaveText('반려동물');
});

test('album selection has a count, explicit actions, select all and clear',async({page})=>{
  await auditLibrary(page);await go(page,'내 앨범');await page.getByRole('button',{name:'선택',exact:true}).click();
  const bar=page.getByRole('region',{name:'선택한 앨범 관리'});
  await expect(bar).toContainText('앨범 0개 선택');await bar.getByRole('button',{name:'전체 선택',exact:true}).click();
  await expect(bar).toContainText('앨범 1개 선택');await expect(bar.getByRole('button',{name:'앨범 수정',exact:true})).toBeEnabled();
  await bar.getByRole('button',{name:'앨범 수정',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'앨범 수정',exact:true});await expect(editor).toBeVisible();
  await back(page);await expect(editor).toHaveCount(0);await expect(bar).toContainText('앨범 1개 선택');
  await bar.getByRole('button',{name:'선택 해제',exact:true}).click();await expect(bar).toContainText('앨범 0개 선택');
  await back(page);await expect(page.locator('.savedAlbums')).toBeVisible();await expect(bar).toHaveCount(0);
});

test('diary selection links the album and Android Back first returns to its list',async({page})=>{
  await auditLibrary(page);
  await page.evaluate(()=>{
    const bridge=(window as any).__TAURI_INTERNALS__, original=bridge.invoke;
    (window as any).__uxAssignments=[];
    bridge.invoke=async(command:string,args:any)=>{
      if(command==='assign_diary_album'){
        (window as any).__uxAssignments.push(args);
        const entries=await original('list_diary');entries.forEach((e:any)=>{if(args.ids.includes(e.id))e.album_id=args.albumId;});return null;
      }
      return original(command,args);
    };
  });
  await go(page,'일기장');await page.getByRole('button',{name:'선택',exact:true}).click();
  const bar=page.getByRole('region',{name:'선택한 일기 관리'});
  await bar.getByRole('button',{name:'현재 결과 전체 선택',exact:true}).click();await expect(bar).toContainText('일기 1편 선택');
  await bar.getByLabel('선택한 일기의 앨범').selectOption('1');await bar.getByRole('button',{name:'앨범 연결 저장',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'앨범 연결을 저장했습니다.'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__uxAssignments)).toEqual([{ids:[1],albumId:1}]);
  await expect(page.locator('.diaryCard')).toHaveCount(1);
  await back(page);await expect(bar).toHaveCount(0);await expect(page.locator('.diaryView')).toBeVisible();
});

test('diary photo detach and cancel preserve the stored diary and source photo',async({page})=>{
  await page.goto('/');await go(page,'일기장');await page.getByRole('button',{name:'첫 일기 쓰기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'새 일기',exact:true});await dialog.getByLabel('제목',{exact:true}).fill('사진과 하루');
  const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'사진 추가',exact:true}).click();
  await (await chooser).setFiles('tests/fixtures/pet-dog.jpg');
  await expect(dialog.getByRole('button',{name:'1번째 사진 첨부 해제',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'일기 저장',exact:true}).click();await page.locator('.diaryOpen').click();
  await page.getByRole('button',{name:'1번째 사진 첨부 해제',exact:true}).click();
  await expect(page.locator('.diaryAttachmentPrint')).toHaveCount(0);
  page.once('dialog',d=>d.dismiss());await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();
  await page.locator('.diaryOpen').click();await expect(page.locator('.diaryAttachmentPrint')).toHaveCount(1);
});

test('favorite action names, red badge and return scroll reflect actual toggles',async({page})=>{
  await auditLibrary(page);await go(page,'사진 기록');
  const tile=page.locator('.mediaTile').first();await tile.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);await tile.click();
  const dialog=page.getByRole('dialog',{name:'사진 상세',exact:true});
  await dialog.getByRole('button',{name:'즐겨찾기 추가',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'즐겨찾기 해제',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(dialog.locator('.favoritePhotoBadge')).toBeVisible();
  await dialog.getByRole('button',{name:'즐겨찾기 해제',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'즐겨찾기 추가',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(dialog.locator('.favoritePhotoBadge')).toHaveCount(0);await back(page);
  await expect(page.locator('.libraryView')).toBeVisible();expect(Math.abs((await page.evaluate(()=>scrollY))-scroll)).toBeLessThan(3);
});

test('whole menu reveals every destination and retapping current view keeps selection',async({page,isMobile})=>{
  test.skip(!isMobile,'Overflow menu is shown only when navigation overflows.');
  await auditLibrary(page);const all=page.getByRole('button',{name:'전체 메뉴',exact:true});await all.click();
  const menu=page.locator('.actionMenuPanel');for(const name of ['홈','사진 기록','내 앨범','일기장','추억','새싹 도감','사람과 반려동물','설정'])await expect(menu.getByRole('button',{name,exact:true})).toBeVisible();
  await menu.getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.getByRole('button',{name:'선택',exact:true}).click();await page.locator('.mediaTile').first().click();
  await go(page,'사진 기록');await expect(page.locator('.selectionDock')).toContainText('항목 1개 선택');
  await all.click();await page.evaluate(()=>window.__gamjassakBack?.());await expect(menu).toHaveCount(0);
  await expect(page.locator('.selectionDock')).toContainText('항목 1개 선택');
});

for(const width of [320,360,393,851])test(`bottom actions and full menu fit ${width}px`,async({page,isMobile})=>{
  test.skip(!isMobile,'Phone geometry.');const height=width===851?393:740;await page.setViewportSize({width,height});await auditLibrary(page);
  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();const menu=page.locator('.actionMenuPanel');
  const bounds=(await menu.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(9);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width-9);
  await menu.getByRole('button',{name:'사진 기록',exact:true}).click();await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.locator('.mediaTile').first().click();const bar=page.locator('.selectionDock');const b=(await bar.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);expect(b.y+b.height).toBeLessThanOrEqual(height);
  for(const control of await bar.getByRole('button').all()){const r=(await control.boundingBox())!;expect(r.height).toBeGreaterThanOrEqual(44);}
});
