import { expect, test, type Page } from '@playwright/test';

async function prepare(page:Page) {
  await page.route('**/entity-fixture.jpg',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.addInitScript(()=>{
    const people:any[]=[{id:1,name:'가족',media_ids:[4],cover_face_id:11},{id:2,name:'친구',media_ids:[]},{id:3,name:'',media_ids:[]}];
    const faces:any[]=[{id:11,media_id:1,person_id:1,confirmed:true},{id:12,media_id:1,person_id:2,confirmed:true},{id:21,media_id:2,person_id:3,confirmed:false},{id:22,media_id:3,person_id:3,confirmed:false}].map(row=>({...row,thumbnail:'/entity-fixture.jpg'}));
    const pets:any[]=[{id:1,name:'보리',media_ids:[1,2],cover_media_id:1},{id:2,name:'콩',media_ids:[1],cover_media_id:1}];
    const unknown:any[]=[{id:31,media_id:3,box_:[.1,.1,.3,.5]},{id:-4,media_id:4,box_:null}];
    const excluded=new Set<number>(),calls:any[]=[];
    const save=()=>localStorage.setItem('entity-calls',JSON.stringify(calls));
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/entity-fixture.jpg',invoke:async(command:string,args:any={})=>{
      calls.push({command,args});save();
      if(command==='list_media')return [1,2,3,4].map(id=>({id,file_path:`/photos/${id}.jpg`,file_type:'image',taken_at:'2026-10-22',width:640,height:480,size_bytes:500,rating:0,comment:'',favorite:id===1,metadata_status:'ready'}));
      if(command==='media_thumbnail')return '/entity-fixture.jpg';
      if(command==='list_face_index')return structuredClone({people,faces:faces.filter(face=>!excluded.has(face.id)),scanned:[1,2,3,4]});
      if(command==='list_pets')return structuredClone(pets);
      if(command==='list_unknown_pet_items')return structuredClone(unknown);
      if(command==='find_face_matches')return [{face_id:21,person_id:1}];
      if(command==='assign_person_faces'){
        if(localStorage.getItem('fail-assignment'))throw '일시적인 저장 실패';
        const id=args.target??Math.max(...people.map(row=>row.id))+1;
        if(args.target===null)people.push({id,name:args.name??'',media_ids:[]});
        faces.filter(face=>args.ids.includes(face.id)).forEach(face=>{face.person_id=id;face.confirmed=args.target!==null || Boolean(args.name);});return id;
      }
      if(command==='set_faces_excluded'){args.ids.forEach((id:number)=>args.excluded?excluded.add(id):excluded.delete(id));return;}
      if(command==='rename_face_person'){people.find(row=>row.id===args.id).name=args.name;return;}
      if(command==='set_person_cover_photo'){const owner=people.find(row=>row.id===args.personId);owner.cover_media_id=args.mediaId;return;}
      if(command==='rename_pet'){pets.find(row=>row.id===args.id).name=args.name;return args.id;}
      if(command==='set_pet_cover_photo'){pets.find(row=>row.id===args.petId).cover_media_id=args.mediaId;return args.petId;}
      if(command==='save_pet'){const id=args.id??Math.max(...pets.map(row=>row.id))+1;const row={id,name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId};const at=pets.findIndex(pet=>pet.id===id);if(at<0)pets.push(row);else pets[at]=row;return id;}
      if(command==='assign_pet_detections'){const id=args.target??Math.max(...pets.map(row=>row.id))+1;if(args.target===null)pets.push({id,name:args.name,media_ids:[],cover_media_id:null});const owner=pets.find(row=>row.id===id);for(let i=unknown.length-1;i>=0;i--)if(args.ids.includes(unknown[i].id)){owner.media_ids=[...new Set([...owner.media_ids,unknown[i].media_id])];unknown.splice(i,1);}return id;}
      if(command==='edit_entity_photo_links'){
        if(args.kind==='person'){
          faces.filter(face=>face.person_id===args.source && args.ids.includes(face.media_id)).forEach(face=>face.person_id=args.target??3);
          const owner=people.find(row=>row.id===args.source);owner.media_ids=owner.media_ids.filter((id:number)=>!args.ids.includes(id));
        }else {const owner=pets.find(row=>row.id===args.source);owner.media_ids=owner.media_ids.filter((id:number)=>!args.ids.includes(id));if(args.target){const dest=pets.find(row=>row.id===args.target);dest.media_ids=[...new Set([...dest.media_ids,...args.ids])];}}
        return args.target;
      }
      return [];
    }}});
  });
  await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
}
async function calls(page:Page,command:string){return page.evaluate(command=>JSON.parse(localStorage.getItem('entity-calls')??'[]').filter((row:any)=>row.command===command).map((row:any)=>row.args),command);}

// The fixture verifies UI-to-IPC scope. Rust tests independently verify the real
// transactions, rollback, multi-object preservation, and migration behavior.
test('unknown faces can share a new name; failed save retains both selections and draft',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:/^미확인 인물 ·/}).click();await page.getByRole('button',{name:'선택',exact:true}).click();
  const bar=page.getByRole('region',{name:'선택한 얼굴 관리'});await bar.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(bar).toContainText('얼굴 2개 선택');
  await bar.getByRole('button',{name:'이름 지정',exact:true}).click();const dialog=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await dialog.getByRole('button',{name:'새 인물',exact:true}).click();await dialog.getByLabel('새 인물 이름').fill('할머니');await page.evaluate(()=>localStorage.setItem('fail-assignment','1'));
  await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByLabel('새 인물 이름')).toHaveValue('할머니');await expect(bar).toContainText('얼굴 2개 선택');
  await page.evaluate(()=>localStorage.removeItem('fail-assignment'));await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(dialog).toBeHidden();
  expect((await calls(page,'assign_person_faces')).at(-1)).toEqual({ids:[21,22],target:null,name:'할머니'});
  expect(await calls(page,'save_face_scan')).toEqual([]);expect(await calls(page,'refresh_face_scan')).toEqual([]);
  await page.locator('.entityHeader').getByRole('button',{name:'선택 취소',exact:true}).click();await page.getByRole('button',{name:'인물별 보기',exact:true}).click();await expect(page.getByRole('button',{name:'할머니 2장',exact:true})).toBeVisible();
});

test('photo reassignment includes source identity and leaves another person in that photo',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'가족 2장',exact:true}).click();await page.locator('.peopleView > .entityHeader').getByRole('button',{name:'선택',exact:true}).click();await page.getByRole('button',{name:'사진 선택',exact:true}).first().click();
  await page.getByRole('button',{name:'다른 인물로 변경',exact:true}).click();const dialog=page.getByRole('dialog',{name:'이름 지정',exact:true});await dialog.getByLabel('인물 선택').selectOption('2');await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();
  expect(await calls(page,'edit_entity_photo_links')).toEqual([{kind:'person',source:1,ids:[1],action:'move',target:2,name:null}]);
  await expect(page.locator('.peopleView > .entityHeader')).toContainText('사진 1장');await expect(page.getByRole('complementary').getByRole('button',{name:'친구 사진 1장',exact:true})).toBeVisible();
  expect(await calls(page,'delete_media')).toEqual([]);
});

test('manual person photos support cover changes and selection cancel stays in detail',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'가족 2장',exact:true}).click();await page.getByRole('button',{name:'인물 관리',exact:true}).click();await page.getByRole('button',{name:'대표 사진 변경',exact:true}).click();await page.getByRole('button',{name:'대표 사진으로 설정',exact:true}).nth(1).click();
  expect(await calls(page,'set_person_cover_photo')).toEqual([{personId:1,mediaId:4}]);
  await page.getByRole('button',{name:'선택',exact:true}).click();const bar=page.getByRole('region',{name:'선택한 사진 관리'});await bar.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(bar).toContainText('사진 2개 선택');await bar.getByRole('button',{name:'선택 해제',exact:true}).click();await expect(bar).toContainText('사진 0개 선택');
  await page.locator('.entityHeader').getByRole('button',{name:'선택 취소',exact:true}).click();await expect(bar).toBeHidden();await expect(page.locator('.peopleView > .entityHeader')).toContainText('가족');
  await page.getByRole('button',{name:'이름 변경',exact:true}).click();const dialog=page.getByRole('dialog',{name:'이름 변경',exact:true});await dialog.getByLabel('인물 이름').fill('취소할 이름');await dialog.getByRole('button',{name:'취소',exact:true}).click();expect(await calls(page,'rename_face_person')).toEqual([]);
});

test('unknown pet objects and manual photos both accept existing and new names',async({page})=>{
  await prepare(page);await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'미확인 반려동물',exact:true}).click();await page.locator('.petsView > .entityHeader').getByRole('button',{name:'선택',exact:true}).click();
  await page.getByRole('button',{name:'반려동물 선택 31',exact:true}).click();await page.getByRole('button',{name:'이름 지정',exact:true}).click();let dialog=page.getByRole('dialog',{name:'이름 지정',exact:true});await dialog.getByLabel('반려동물 선택').selectOption('1');await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(dialog).toBeHidden();
  await page.getByRole('button',{name:'반려동물 선택 -4',exact:true}).click();await page.getByRole('button',{name:'이름 지정',exact:true}).click();dialog=page.getByRole('dialog',{name:'이름 지정',exact:true});await dialog.getByRole('button',{name:'새 반려동물',exact:true}).click();await dialog.getByLabel('새 반려동물 이름').fill('밤이');await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();
  expect(await calls(page,'assign_pet_detections')).toEqual([{ids:[31],target:1,name:null},{ids:[-4],target:null,name:'밤이'}]);expect(await calls(page,'enqueue_pet_jobs')).toEqual([]);
});

test('pet photo correction uses the same selection bar and keeps sibling pet membership',async({page})=>{
  await prepare(page);await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'보리 2장',exact:true}).click();await page.locator('.petsView > .entityHeader').getByRole('button',{name:'선택',exact:true}).click();await page.getByRole('button',{name:'사진 선택',exact:true}).first().click();await page.getByRole('button',{name:'미확인 상태로 변경',exact:true}).click();
  expect(await calls(page,'edit_entity_photo_links')).toEqual([{kind:'pet',source:1,ids:[1],action:'unknown',target:null,name:null}]);await expect(page.locator('.petsView > .entityHeader')).toContainText('사진 1장');
  await page.locator('.entityHeader').getByRole('button',{name:'선택 취소',exact:true}).click();await expect(page.locator('.petsView > .entityHeader')).toContainText('보리');await page.getByRole('button',{name:'반려동물 목록',exact:true}).click();await expect(page.getByRole('button',{name:'콩 1장',exact:true})).toBeVisible();
});

test('entity lists have scoped selection; switching tabs cancels hidden selection',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'선택',exact:true}).click();let bar=page.getByRole('region',{name:'선택한 인물 관리'});await bar.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(bar).toContainText('인물 3개 선택');await expect(bar.getByRole('button',{name:'인물 등록 삭제',exact:true})).toBeEnabled();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'선택',exact:true}).click();bar=page.getByRole('region',{name:'선택한 반려동물 관리'});await bar.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(bar).toContainText('반려동물 2개 선택');
  await page.getByRole('tab',{name:'인물',exact:true}).click();await expect(page.getByRole('region',{name:'선택한 인물 관리'})).toHaveCount(0);expect(await calls(page,'remove_entity_registrations')).toEqual([]);
});
