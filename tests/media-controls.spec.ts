import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function setup(page: Page, thumbnailFailure = false) {
  await page.route('**/controls-photo.jpg*', route => route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.route('http://127.0.0.1:7788/**', route => route.fulfill({path:'tests/fixtures/playback.mp4',contentType:'video/mp4'}));
  await page.route('**/controls-video.mp4', route => route.fulfill({path:'tests/fixtures/playback.mp4',contentType:'video/mp4'}));
  await page.addInitScript(({thumbnailFailure}) => {
    const rows = [
      {id:1,file_path:'/controls-video.mp4',file_type:'video',taken_at:'2026-10-23',created_at:'2026-10-20 09:00:00',rating:2},
      {id:2,file_path:'/controls-photo.jpg?2',file_type:'image',taken_at:'2025-01-01',created_at:'2026-10-22 09:00:00',rating:5},
      {id:3,file_path:'/controls-photo.jpg?3',file_type:'image',taken_at:'2026-01-01',created_at:'2026-10-21 09:00:00',rating:4},
    ].map(row=>({...row,size_bytes:1000,comment:'',favorite:false,metadata_status:'ready'}));
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{
      convertFileSrc:(path:string)=>path,
      invoke:async(command:string,{id}:{id?:number}={})=>{
        if(command==='list_media')return rows;
        if(command==='media_playback_source')return 'http://127.0.0.1:7788/abcdef/1';
        if(command==='media_thumbnail') {if(thumbnailFailure && id===1)throw Error('unsupported native decoder');return '/controls-photo.jpg?thumbnail';}
        if(command==='list_pet_jobs')return {jobs:[],pending:0,paused:0,failed:0};
        return [];
      },
    }});
  },{thumbnailFailure});
  await page.goto('/');
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.getByRole('button',{name:'모든 기록',exact:true}).click();
}

test('capture current media controls',async({page,isMobile})=>{
  test.skip(!isMobile,'Mobile before and after capture.');await setup(page);
  await page.evaluate(()=>document.fonts.ready);
  const stage=process.env.APP_UX_STAGE??'after',dir=`preview-results/app-ux/${stage}`;
  await mkdir(dir,{recursive:true});
  await page.locator('.mediaTile').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({path:`${dir}/18-video-thumbnail.png`});
  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  await page.screenshot({path:`${dir}/19-menu-icons.png`});
});

test('all five requested sorts visibly preserve the selected order across capture dates',async({page})=>{
  await setup(page);
  for(const [sort,ids] of [
    ['date-desc',['1','3','2']],['date-asc',['2','3','1']],
    ['registered-desc',['2','3','1']],['registered-asc',['1','3','2']],['rating',['2','3','1']],
  ] as const){
    await page.getByLabel('정렬 기준',{exact:true}).selectOption(sort);
    await expect.poll(()=>page.locator('.mediaTile').evaluateAll(tiles=>tiles.map(tile=>tile.getAttribute('data-media-id')))).toEqual(ids);
  }
  await expect(page.getByLabel('정렬 기준',{exact:true}).locator('option')).toContainText(['촬영일 최신순','촬영일 오래된순','등록일 최신순','등록일 오래된순','별점 높은순']);
});

test('every hamburger destination has its own icon and the current page remains identified',async({page,isMobile})=>{
  test.skip(!isMobile,'Overflow header on Android phone.');await setup(page);
  await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();
  const menu=page.locator('.actionMenuPanel');
  const icons=[];
  for(const name of ['홈','사진 기록','내 앨범','일기장','추억','새싹 도감','사람과 반려동물','설정']){
    const button=menu.getByRole('button',{name,exact:true});await expect(button.locator('svg')).toHaveCount(1);
    icons.push(await button.locator('svg').getAttribute('class'));
  }
  expect(new Set(icons).size).toBe(8);
  await expect(menu.getByRole('button',{name:'사진 기록',exact:true})).toHaveAttribute('aria-current','page');
  await menu.getByRole('button',{name:'일기장',exact:true}).click();await expect(page.locator('.diaryView')).toBeVisible();
});

for(const fallback of [false,true])test(`video grid decodes a real preview ${fallback?'through browser fallback':'from native cache'}`,async({page})=>{
  await setup(page,fallback);
  const tile=page.locator('.mediaTile[data-media-id="1"]'),image=tile.locator('img.mediaImage');
  await tile.scrollIntoViewIfNeeded();
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(image).toHaveAttribute('src',fallback?/^data:image\/jpeg/:/thumbnail/);
  await expect(tile.locator('video')).toHaveCount(0);
  await tile.click();const player=page.getByRole('dialog',{name:'사진 상세',exact:true}).locator('video');
  await expect(player).toBeVisible();await expect.poll(()=>player.evaluate((video:HTMLVideoElement)=>video.readyState)).toBeGreaterThanOrEqual(2);
});
