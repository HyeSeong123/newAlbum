import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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
   if(command==='list_pets')return structuredClone(state.pets);
   if(command==='list_pet_jobs')return {jobs:structuredClone(state.jobs),pending:state.jobs.filter((j:any)=>j.state==='pending').length,paused:state.jobs.filter((j:any)=>j.state==='paused').length,failed:0};
   if(command==='enqueue_pet_jobs'){for(const job of args.jobs)state.jobs.push({id:state.jobs.length+1,media_id:job.mediaId,pet_id:job.petId,view:job.view,state:'pending'});persist();return;}
   if(command==='finish_pet_job'){state.jobs=state.jobs.filter((j:any)=>j.id!==args.id);persist();return;}
   if(command==='control_pet_jobs'){for(const job of state.jobs)job.state=args.resume?'pending':'paused';persist();return;}
   if(command==='prepare_pet_input')return {path:'/pet-improve.jpg',sourceKey:`sha256:${String(args.id).padStart(64,'0')}`};
   if(command==='get_pet_scan')return state.scanned.includes(args.mediaId)?{media_id:args.mediaId,engine_version:'gamjassak-pets-v4-review',source_key:`sha256:${String(args.mediaId).padStart(64,'0')}`,detections:structuredClone(state.detections.filter((d:any)=>d.media_id===args.mediaId))}:null;
   if(command==='save_pet'){const id=args.id??state.pets.length+1;state.pets.push({id,name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId});persist();return id;}
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
async function photo(page:Page){await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();await page.getByRole('button',{name:'모든 기록',exact:true}).click();await page.getByRole('button',{name:'photo1.jpg 상세보기',exact:true}).click();}

test('first registration remains idle until its reference photos are explicitly refreshed',async({page})=>{
 await fixture(page,true);await pets(page);
 expect(await page.evaluate(()=>(window as any).__petImprove.workers)).toBe(0);
 await expect(page.getByRole('button',{name:'인식 기준 갱신',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'반려동물 추가',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'반려동물 추가',exact:true});
 await editor.getByLabel('이름',{exact:true}).fill('우리 보리');
 await editor.getByRole('button',{name:'사진 선택',exact:true}).nth(0).click();
 await editor.getByRole('button',{name:'사진 선택',exact:true}).nth(1).click();
 await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor).toBeHidden();
 expect(await page.evaluate(()=>(window as any).__petImprove.workers)).toBe(0);
 await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();
 await page.getByRole('button',{name:'인식 기준 갱신',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__petImprove.state.jobs.length)).toBe(0);
 await expect(page.locator('.petsView .petAnalysisNotice')).toContainText('다시 분석 완료');
 expect(await page.evaluate(()=>(window as any).__petImprove.state.pets[0].media_ids)).toEqual([1,2]);
 expect(await page.evaluate(()=>(window as any).__petImprove.state.detections.map((d:any)=>d.pet_id))).toEqual([1,1]);
 expect(await page.evaluate(()=>(window as any).__petImprove.calls.filter((c:any)=>c.command==='enqueue_pet_jobs').flatMap((c:any)=>c.args.jobs).map((j:any)=>({mediaId:j.mediaId,petId:j.petId,refresh:j.refresh})))).toEqual([{mediaId:1,petId:1,refresh:true},{mediaId:2,petId:1,refresh:true}]);
});

test('manual body region adds only one animal and preserves existing confirmed links',async({page})=>{
 await fixture(page);await photo(page);
 await page.getByRole('button',{name:'반려동물 직접 추가',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'반려동물 직접 추가',exact:true});
 await expect(dialog.locator('header strong')).toHaveCSS('color',await dialog.evaluate(node=>getComputedStyle(node).color));
 await dialog.getByText('영역 크기 조정',{exact:true}).click();
 for(const [label,value]of [['가로 위치 (%)','60'],['세로 위치 (%)','10'],['너비 (%)','30'],['높이 (%)','50']])await dialog.getByLabel(label,{exact:true}).fill(value);
 await dialog.getByRole('button',{name:'영역 추가',exact:true}).click();await expect(dialog).toBeHidden();
 const added=page.locator('.petDetectionCard').last();await added.getByLabel('인식된 반려동물',{exact:true}).selectOption('2');await added.getByRole('button',{name:'변경 저장',exact:true}).click();
 const rows=await page.evaluate(()=>(window as any).__petImprove.state.detections.filter((d:any)=>d.media_id===1));
 expect(rows).toHaveLength(2);expect(rows[0].pet_id).toBe(1);expect(rows[1].pet_id).toBe(2);expect(rows[1].detectionSource).toBe('user');expect(rows[1].box).toEqual([.6,.1,.3,.5]);
});

test('wrong candidate is remembered across searches and reloads',async({page})=>{
 await fixture(page);await pets(page);await page.getByRole('button',{name:'반려동물 사진 찾기',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'반려동물 사진 찾기',exact:true});const selector=()=>dialog.getByLabel('반려동물 후보 40',{exact:true});
 await expect(selector()).toHaveValue('1');await dialog.locator('.petSearchCard').getByRole('button',{name:'이 후보 제외',exact:true}).click();
 await expect(selector()).toHaveValue('2');await expect(selector().locator('option[value="1"]')).toHaveCount(0);
 await dialog.locator('footer').getByRole('button',{name:'닫기',exact:true}).click();await page.reload();await pets(page);await page.getByRole('button',{name:'반려동물 사진 찾기',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'반려동물 사진 찾기',exact:true});await expect(selector()).toHaveValue('2');
 expect(await page.evaluate(()=>(window as any).__petImprove.workers)).toBe(0);
});

test('capture current pet controls',async({page,isMobile})=>{
 test.skip(!isMobile,'Phone comparison capture.');await fixture(page);await pets(page);
 const stage=process.env.APP_UX_STAGE??'after',dir=`preview-results/app-ux/${stage}`;await mkdir(dir,{recursive:true});await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${dir}/20-pet-actions.png`});
 if(stage==='after'){
  await page.getByRole('button',{name:'미확인 반려동물',exact:true}).click();await page.screenshot({path:`${dir}/21-pet-unknown-results.png`});
  await photo(page);await page.getByRole('button',{name:'반려동물 직접 추가',exact:true}).click();await page.screenshot({path:`${dir}/22-pet-manual-region.png`});
 }
});


test('album scope limits candidates without starting analysis',async({page})=>{
 await fixture(page);await pets(page);await page.getByRole('button',{name:'반려동물 사진 찾기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'반려동물 사진 찾기',exact:true});await expect(dialog.locator('.petSearchCard')).toHaveCount(1);
 await dialog.getByLabel('반려동물 검색 범위',{exact:true}).selectOption('2');await expect(dialog.locator('.petSearchCard')).toHaveCount(0);
 await dialog.getByLabel('반려동물 검색 범위',{exact:true}).selectOption('1');await expect(dialog.locator('.petSearchCard')).toHaveCount(1);
 expect(await page.evaluate(()=>(window as any).__petImprove.workers)).toBe(0);
});
