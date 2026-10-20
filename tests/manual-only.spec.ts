import { test, expect, type Page } from '@playwright/test';

async function manualLibrary(page: Page) {
  await page.route('**/manual-photo-*.jpg', route => route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.addInitScript(() => {
    const seed = {people:[{id:7,name:'기존 가족',cover_face_id:91,media_ids:[2]}],faces:[{id:91,media_id:1,person_id:7,thumbnail:'/manual-photo-1.jpg',confirmed:true}],scanned:[1]};
    const index = JSON.parse(localStorage.getItem('manual-people') ?? JSON.stringify(seed));
    let pets = JSON.parse(localStorage.getItem('manual-pets') ?? '[{"id":12,"name":"기존 보리","cover_media_id":2,"media_ids":[2,3]}]');
    const legacy = {id:51,pet_id:12,media_id:2,view:'left',viewSource:'user',confirmed:true,appearance:[.5]};
    const calls: string[] = []; (window as any).manualCalls = calls;
    (window as any).manualState = () => ({index,pets,legacy});
    (window as any).failNextManualSave = false;
    const media = Array.from({length:30},(_,i)=>({id:i+1,file_path:`/manual-photo-${i+1}.jpg`,file_type:'image',taken_at:'2026-10-20',size_bytes:100,favorite:false,rating:0,comment:'',metadata_status:'ready'}));
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:(p:string)=>p,invoke:async(command:string,args:any={})=>{
      calls.push(command);
      if(command==='list_media') return media;
      if(command==='list_albums'||command==='list_diary')return [];
      if(command==='media_thumbnail')return '';
      if(command==='list_face_index')return structuredClone(index);
      if(command==='list_pets')return structuredClone(pets);
      if(command==='save_manual_person_photos'){
        if((window as any).failNextManualSave){(window as any).failNextManualSave=false;throw new Error('저장 실패 시험');}
        const id=args.personId??20;
        const person=index.people.find((p:any)=>p.id===id);
        if(person)person.media_ids=args.mediaIds;else index.people.push({id,name:args.name,media_ids:args.mediaIds});
        localStorage.setItem('manual-people',JSON.stringify(index));return id;
      }
      if(command==='rename_face_person'){
        index.people.find((p:any)=>p.id===args.id).name=args.name;localStorage.setItem('manual-people',JSON.stringify(index));return;
      }
      if(command==='save_pet'){
        const id=args.id??30;pets=[...pets.filter((p:any)=>p.id!==id),{id,name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId}];localStorage.setItem('manual-pets',JSON.stringify(pets));return id;
      }
      if(/scan|enqueue|prepare_pet|person_jobs|pet_jobs|find_face_matches|recognition/.test(command))throw new Error('Inference must be unreachable: '+command);
      return [];
    }}});
  });
  await page.goto('/');
}
async function noInference(page:Page,workers:number,requests:string[]){
 expect(workers).toBe(0);expect(requests).toEqual([]);
 expect(await page.evaluate(()=>(window as any).manualCalls.filter((c:string)=>/scan|enqueue|prepare_pet|person_jobs|pet_jobs|find_face_matches|recognition/.test(c)))).toEqual([]);
 await expect(page.getByRole('button',{name:/사진에서 사람 찾기|등록된 사진에서 찾기|등록 사진 다시 분석|이어서 분석|인식 검증 열기/})).toHaveCount(0);
}

test('manual people registration retries without inference, preserves legacy IDs and survives reload',async({page})=>{
 let workers=0;const models:string[]=[];page.on('worker',()=>workers++);page.on('request',r=>{if(/\/models\/|tfjs|face-api/.test(r.url()))models.push(r.url());});
 await manualLibrary(page);await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
 await expect(page.getByRole('button',{name:'기존 가족 2장',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'사람 직접 등록',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'사람 직접 등록',exact:true});await dialog.getByLabel('등록할 이름').fill('직접 등록');
 await dialog.locator('[data-selection-id="3"]').click();await dialog.getByRole('button',{name:'다음 사진',exact:true}).click();await dialog.locator('[data-selection-id="25"]').click();
 await page.evaluate(()=>(window as any).failNextManualSave=true);await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('저장 실패 시험');await expect(dialog.getByLabel('등록할 이름')).toHaveValue('직접 등록');await expect(dialog.getByRole('status')).toHaveText('사진 2장 선택');
 await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();await expect(dialog).toBeHidden();
 await expect(page.getByRole('heading',{name:'직접 등록',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'사람 관리',exact:true}).click();await page.getByRole('button',{name:'이름 수정',exact:true}).click();
 const rename=page.getByRole('dialog',{name:'이름 수정',exact:true});await rename.getByLabel('인물 이름').fill('수정한 이름');await rename.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(rename).toBeHidden();
 const state=await page.evaluate(()=>(window as any).manualState());expect(state.index.faces).toEqual([{id:91,media_id:1,person_id:7,thumbnail:'/manual-photo-1.jpg',confirmed:true}]);expect(state.index.people.find((p:any)=>p.id===20)).toMatchObject({name:'수정한 이름',media_ids:[3,25]});
 await page.screenshot({path:'preview-results/manual-only-people.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await expect(page.getByRole('button',{name:'수정한 이름 2장',exact:true})).toBeVisible();
 await noInference(page,workers,models);
});

test('manual pet editing preserves profile and confirmed legacy detection without loading models',async({page})=>{
 let workers=0;const models:string[]=[];page.on('worker',()=>workers++);page.on('request',r=>{if(/\/models\/|tfjs|face-api/.test(r.url()))models.push(r.url());});
 await manualLibrary(page);await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'기존 보리 2장',exact:true}).click();
 await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();let dialog=page.getByRole('dialog',{name:'반려동물 편집',exact:true});
 await dialog.locator('[data-selection-id="4"]').click();await dialog.getByRole('button',{name:'취소',exact:true}).click();expect((await page.evaluate(()=>(window as any).manualState())).pets[0].media_ids).toEqual([2,3]);
 await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();dialog=page.getByRole('dialog',{name:'반려동물 편집',exact:true});await dialog.getByLabel('이름',{exact:true}).fill('보리와 산책');await dialog.locator('[data-selection-id="4"]').click();await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).toBeHidden();
 const state=await page.evaluate(()=>(window as any).manualState());expect(state.pets[0]).toEqual({id:12,name:'보리와 산책',media_ids:[2,3,4],cover_media_id:2});expect(state.legacy).toEqual({id:51,pet_id:12,media_id:2,view:'left',viewSource:'user',confirmed:true,appearance:[.5]});
 await page.screenshot({path:'preview-results/manual-only-pets.png',fullPage:true});
 await page.getByRole('button',{name:'사진 상세보기',exact:true}).first().click();await expect(page.getByRole('heading',{name:'사진 정보',exact:true})).toBeVisible();await noInference(page,workers,models);
});
