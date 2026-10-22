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
      if(command==='list_unknown_pet_items')return [];
      if(command==='list_pet_jobs')return {jobs:[],pending:0,paused:0,failed:0};
      return [];
    }}});
  });
  const stage=before?'before':'after';
  async function capture(name:string) {
    await page.evaluate(async()=>{
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
});
