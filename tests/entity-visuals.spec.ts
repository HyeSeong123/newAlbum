import { expect, test } from '@playwright/test';

const before = process.env.ENTITY_UX_BASELINE === '1';
test('people and pets mobile before-after evidence uses the same data and viewport',async({page,isMobile})=>{
  test.skip(!isMobile,'Comparable phone screenshots are captured once.');
  await page.setViewportSize({width:393,height:851});
  await page.route('**/ux-person.jpg',route=>route.fulfill({path:'node_modules/@vladmandic/face-api/demo/sample1.jpg',contentType:'image/jpeg'}));
  await page.route('**/ux-pet.jpg',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.addInitScript(()=>{
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:(path:string)=>path.includes('pet')?'/ux-pet.jpg':'/ux-person.jpg',invoke:async(command:string,args:any={})=>{
      if(command==='list_media')return [1,2,3].map(id=>({id,file_path:id===3?'/photos/pet.jpg':`/photos/person-${id}.jpg`,file_type:'image',taken_at:'2026-10-22',width:640,height:480,size_bytes:1000,rating:0,comment:'',favorite:id===1,metadata_status:'ready'}));
      if(command==='media_thumbnail')return args.id===3?'/photos/pet.jpg':'/photos/person.jpg';
      if(command==='list_face_index')return {people:[{id:1,name:'우리 가족',media_ids:[],cover_face_id:11},{id:2,name:'',media_ids:[]}],faces:[{id:11,person_id:1,media_id:1,thumbnail:'/ux-person.jpg',confirmed:true},{id:12,person_id:1,media_id:2,thumbnail:'/ux-person.jpg',confirmed:false},{id:21,person_id:2,media_id:2,thumbnail:'/ux-person.jpg',confirmed:false}],scanned:[1,2,3]};
      if(command==='list_pets')return [{id:1,name:'보리',media_ids:[3],cover_media_id:3}];
      if(command==='list_unknown_pet_items')return [{id:31,media_id:3,box_:[.15,.1,.6,.7]}];
      if(command==='list_pet_jobs')return {jobs:[],pending:0,paused:0,failed:0};
      return [];
    }}});
  });
  const stage=before?'before':'after';
  async function capture(name:string) {
    await page.evaluate(async()=>{
      window.scrollTo(0,0);
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll<HTMLImageElement>('.peopleWorkspace img')].filter(image=>image.getClientRects().length).map(image=>{image.loading='eager';return image.decode().catch(()=>undefined);}));
    });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`preview-results/entity-ux-${stage}-${name}.png`,fullPage:true});
  }
  await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await expect(page.getByRole('button',{name:'우리 가족 2장',exact:true})).toBeVisible();await capture('people-list');
  await page.getByRole('button',{name:'우리 가족 2장',exact:true}).click();await expect(page.locator('.peopleView > .entityHeader')).toContainText('우리 가족');await capture('person-detail');
  await page.getByRole('button',{name:before?'사람 관리':'인물 관리',exact:true}).click();await expect(page.locator('.actionMenuPanel')).toBeVisible();await capture('person-menu');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:before?'사람 목록':'인물 목록',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();await expect(page.getByRole('button',{name:'보리 1장',exact:true})).toBeVisible();await capture('pets-list');
  await page.getByRole('button',{name:'보리 1장',exact:true}).click();await expect(page.locator('.petsView > .entityHeader')).toContainText('보리');await capture('pet-detail');
  await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();await expect(page.locator('.actionMenuPanel')).toBeVisible();await capture('pet-menu');
  if (before) return;
  await page.keyboard.press('Escape');
  await page.locator('.petsView > .entityHeader').getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('button',{name:'사진 선택',exact:true}).click();await capture('pet-selection');
  await page.getByRole('button',{name:'다른 반려동물로 변경',exact:true}).click();await capture('pet-assignment');
  await page.getByRole('dialog',{name:'이름 지정',exact:true}).getByRole('button',{name:'취소',exact:true}).click();
  await page.locator('.entitySelectionBar').getByRole('button',{name:'선택 취소',exact:true}).click();
  await page.getByRole('button',{name:'반려동물 목록',exact:true}).click();await page.getByRole('button',{name:'미확인 반려동물',exact:true}).click();
  await page.locator('.petsView > .entityHeader').getByRole('button',{name:'선택',exact:true}).click();await page.getByRole('button',{name:'반려동물 선택 31',exact:true}).click();await capture('unknown-pets');
  await page.getByRole('tab',{name:'인물',exact:true}).click();await page.getByRole('button',{name:/^미확인 인물 ·/}).click();await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('region',{name:'선택한 얼굴 관리'}).getByRole('button',{name:'전체 선택',exact:true}).click();await capture('unknown-faces');
  await page.getByRole('button',{name:'이름 지정',exact:true}).click();await page.getByRole('button',{name:'새 인물',exact:true}).click();await page.getByLabel('새 인물 이름').fill('할머니');await capture('face-assignment');
  for (const width of [320,360]) {
    await page.setViewportSize({width,height:851});await capture(`face-assignment-${width}`);
    const dialog=page.getByRole('dialog',{name:'이름 지정',exact:true});const box=(await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
  }
});
