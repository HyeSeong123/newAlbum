import { expect, test, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';


async function expectDialogControlsClearOfHelp(page: Page, dialog: Locator) {
  expect(page.viewportSize()?.width).toBe(393);
  const help = page.getByRole('button', { name: '현재 화면 도움말', exact: true });
  await expect(help).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const helpBox = await help.boundingBox();
  expect(helpBox).not.toBeNull();
  // Measure the actual error state without scrolling the alert or candidates away.
  for (const control of await dialog.locator('select, [role="alert"], footer button').all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    if (box && helpBox) {
      const overlaps = box.x < helpBox.x + helpBox.width && box.x + box.width > helpBox.x
        && box.y < helpBox.y + helpBox.height && box.y + box.height > helpBox.y;
      expect(overlaps, `Help overlaps ${await control.getAttribute('aria-label') ?? await control.textContent()}`).toBe(false);
    }
  }
  const actions = dialog.locator('footer button');
  expect(await actions.count()).toBeGreaterThan(0);
  for (const action of await actions.all()) {
    const dimensions = await action.evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    // Wrapped text is allowed; horizontal clipping is not.
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
}

// Same native/worker fixture as pet-improvements.spec.ts; no model download or real user data.
async function fixture(page:Page,empty=false){
 await page.route('**/pet-improve.jpg*',route=>route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
 await page.addInitScript(({empty})=>{
  const v=(n:number)=>[1,...Array(n-1).fill(0)];
  const feature={kind:'dog',detectedKind:'dog',view:'unknown',viewSource:'unknown',box:[.05,.05,.4,.8],detectionScore:.9,appearance:v(1024),mirroredAppearance:v(1024),color:v(120),shape:v(10)};
  const initial={pets:empty?[]:[{id:1,name:'보리',media_ids:[1,2],cover_media_id:1},{id:2,name:'초코',media_ids:[3],cover_media_id:3}],detections:empty?[]:[{...feature,id:10,media_id:1,pet_id:1,excluded:false},{...feature,id:20,media_id:2,pet_id:1,excluded:false},{...feature,id:30,media_id:3,pet_id:2,excluded:false},{...feature,id:40,media_id:4,pet_id:null,excluded:false}],jobs:[] as any[],scanned:empty?[]:[1,2,3,4]};
  const state:any=JSON.parse(localStorage.getItem('pet-improve-state')||'null')??initial;
  const calls:any[]=[];let workers=0;
  Object.defineProperty(window,'__petImprove',{value:{state,calls,get workers(){return workers;}}});
  const persist=()=>localStorage.setItem('pet-improve-state',JSON.stringify(state));
  class FixtureWorker extends EventTarget {
   stopped=false;
   postMessage(request:any){workers++;setTimeout(()=>{if(this.stopped)return;const features=(request.regions??[feature]).map((r:any)=>({...feature,...r,appearance:v(1024),mirroredAppearance:v(1024),color:v(120),shape:v(10)}));this.dispatchEvent(new MessageEvent('message',{data:{id:request.id,features}}));},30);}
   terminate(){this.stopped=true;}
  }
  Object.defineProperty(window,'Worker',{value:FixtureWorker,configurable:true});
  const media=Array.from({length:4},(_,i)=>({id:i+1,file_path:`/photos/photo${i+1}.jpg`,file_type:'image',taken_at:`2026-10-${23-i}`,width:800,height:600,size_bytes:1000,rating:0,comment:'',favorite:false,metadata_status:'ready'}));
  Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/pet-improve.jpg',invoke:async(command:string,args:any={})=>{
   calls.push({command,args});
   if(command==='list_media')return media;
   if(command==='media_thumbnail')return '/pet-improve.jpg';
   if(command==='list_albums')return [{id:1,title:'산책 사진',created_at:'2026-10-23',description:'',cover_color:'#eee',items:[media[3]]},{id:2,title:'기준 사진',created_at:'2026-10-23',description:'',cover_color:'#eee',items:[media[0]]}];
   if(command==='list_pets'){if(state.failNextList){state.failNextList=false;throw new Error('목록 조회 실패');}return structuredClone(state.pets);}
   if(command==='rename_pet'){const pet=state.pets.find((p:any)=>p.id===args.id);pet.name=args.name;state.failNextList=true;persist();return pet.id;}
   if(command==='list_pet_jobs')return {jobs:structuredClone(state.jobs),pending:state.jobs.filter((j:any)=>j.state==='pending').length,paused:state.jobs.filter((j:any)=>j.state==='paused').length,failed:0};
   if(command==='enqueue_pet_jobs'){for(const job of args.jobs)state.jobs.push({id:state.jobs.length+1,media_id:job.mediaId,pet_id:job.petId,view:job.view,state:'pending'});persist();return;}
   if(command==='finish_pet_job'){state.jobs=state.jobs.filter((j:any)=>j.id!==args.id);persist();return;}
   if(command==='control_pet_jobs'){for(const job of state.jobs)job.state=args.resume?'pending':'paused';persist();return;}
   if(command==='prepare_pet_input')return {path:'/pet-improve.jpg',sourceKey:`sha256:${String(args.id).padStart(64,'0')}`};
   if(command==='get_pet_scan')return state.scanned.includes(args.mediaId)?{media_id:args.mediaId,engine_version:'gamjassak-pets-v4-review',source_key:`sha256:${String(args.mediaId).padStart(64,'0')}`,detections:structuredClone(state.detections.filter((d:any)=>d.media_id===args.mediaId))}:null;
   if(command==='save_pet_scan'){for(const f of args.features)state.detections.push({...f,id:100+state.detections.length,media_id:args.mediaId,pet_id:null,excluded:false});state.scanned.push(args.mediaId);persist();return {media_id:args.mediaId,engine_version:'gamjassak-pets-v4-review',source_key:args.sourceKey,detections:structuredClone(state.detections.filter((d:any)=>d.media_id===args.mediaId))};}
   if(command==='list_pet_detections')return structuredClone(state.detections.filter((d:any)=>(args.mediaId==null||d.media_id===args.mediaId)&&d.id>(args.afterId??0)&&(!args.references||d.pet_id!==null)).slice(0,args.limit??100));
   if(command==='list_unknown_pet_items')return state.detections.filter((d:any)=>d.pet_id===null&&!d.excluded).map((d:any)=>({id:d.id,media_id:d.media_id,box_:d.box}));
   if(command==='add_manual_pet_detection'){const id=Math.max(0,...state.detections.map((d:any)=>d.id))+1;state.detections.push({...args.features,id,media_id:args.mediaId,pet_id:null,excluded:false,detectionSource:'user'});if(!state.scanned.includes(args.mediaId))state.scanned.push(args.mediaId);persist();return id;}
   if(command==='confirm_pet_detection'||command==='update_pet_features'){const row=state.detections.find((d:any)=>d.id===args.detectionId);Object.assign(row,args.features??{},{pet_id:args.petId,excluded:args.excluded??false});if(args.petId){const pet=state.pets.find((p:any)=>p.id===args.petId);pet.media_ids=[...new Set([...pet.media_ids,row.media_id])];}persist();return;}
   if(command==='reject_pet_candidate'){const row=state.detections.find((d:any)=>d.id===args.detectionId);row.rejected_pet_ids=args.rejected?[...new Set([...(row.rejected_pet_ids??[]),args.petId])]:(row.rejected_pet_ids??[]).filter((id:number)=>id!==args.petId);persist();return;}
   if(command==='assign_pet_detections'){const petId=args.target??state.pets.length+1;if(!args.target)state.pets.push({id:petId,name:args.name??args.newName,media_ids:[],cover_media_id:null});const pet=state.pets.find((p:any)=>p.id===petId);for(const id of args.detectionIds??args.ids){const row=state.detections.find((d:any)=>d.id===id);row.pet_id=petId;pet.media_ids=[...new Set([...pet.media_ids,row.media_id])];}persist();return petId;}
   if(command==='list_face_index')return {people:[],faces:[],scanned:[]};
   return [];
  }}});
 },{empty});
 await page.goto('/');
}
async function pets(page:Page){await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();}

const before = process.env.UX_AUDIT_STAGE === 'before';
async function capture(page: Page, name: string) {
 const dir=`preview-results/ux-convenience/${before?'before':'after'}`;
 await mkdir(dir,{recursive:true});
 await page.screenshot({path:`${dir}/${name}.png`});
}

test('pet detection completion leads to unknown animals and name assignment',async({page})=>{
 await fixture(page,true);await pets(page);
 await page.getByRole('button',{name:'사진에서 반려동물 감지',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'반려동물 감지할 사진 선택',exact:true});
 await picker.getByRole('button',{name:'사진 선택 photo1.jpg',exact:true}).click();
 await picker.getByRole('button',{name:'반려동물 감지',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__petImprove.state.jobs.length)).toBe(0);
 const status=page.locator('.petsView .petAnalysisNotice');
 await expect(status.getByRole('button',{name:before?'찾은 사진 연결':'찾은 반려동물 확인',exact:true})).toBeVisible();
 await status.getByRole('button',{name:before?'찾은 사진 연결':'찾은 반려동물 확인',exact:true}).click();
 if(before){await expect(page.getByRole('dialog',{name:'반려동물 사진 찾기',exact:true})).toBeVisible();await capture(page,'11-pet-detection-result');return;}
 await expect(page.getByRole('dialog',{name:'반려동물 사진 찾기',exact:true})).toHaveCount(0);
 await expect(page.locator('.petsView h2')).toHaveText('미확인 반려동물');
 await capture(page,'11-pet-detection-result');
 await page.locator('.petsView .entityHeader').getByRole('button',{name:'선택',exact:true}).click();
 await page.getByRole('button',{name:'현재 페이지 전체 선택',exact:true}).click();
 await page.getByRole('button',{name:'이름 지정',exact:true}).click();
 const assignment=page.getByRole('dialog',{name:'이름 지정',exact:true});
 await assignment.getByLabel('새 반려동물 이름',{exact:true}).fill('감자');
 await assignment.getByRole('button',{name:'이름 지정',exact:true}).click();
 await expect(assignment).toBeHidden();
 expect(await page.evaluate(()=>(window as any).__petImprove.state.pets.map((pet:any)=>({name:pet.name,ids:pet.media_ids})))).toEqual([{name:'감자',ids:[1]}]);
});

test('pet name saved before refresh failure reports committed result',async({page})=>{
 if(!before)await page.setViewportSize({width:393,height:851});
 await fixture(page);await pets(page);
 await page.getByRole('button',{name:'보리 2장',exact:true}).click();
 await page.getByRole('button',{name:'이름 변경',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'이름 변경',exact:true});
 await dialog.getByRole('textbox',{name:'이름',exact:true}).fill('보리 새이름');
 await dialog.getByRole('button',{name:'저장',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText(before?'저장하지 못했습니다':'저장은 완료했지만');
 expect(await page.evaluate(()=>(window as any).__petImprove.state.pets[0].name)).toBe('보리 새이름');
 if(!before)await expectDialogControlsClearOfHelp(page,dialog);
 await capture(page,'12-pet-save-refresh-failure');
 if(before)return;
 await expect(dialog.getByRole('button',{name:'목록 다시 불러오기',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'목록 다시 불러오기',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(page.locator('.petsView h2')).toHaveText('보리 새이름');
 expect(await page.evaluate(()=>(window as any).__petImprove.calls.filter((call:any)=>call.command==='rename_pet').length)).toBe(1);
});
