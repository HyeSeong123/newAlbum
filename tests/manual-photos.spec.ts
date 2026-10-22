import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/manual-photo.jpg', route => route.fulfill({path:'tests/fixtures/pet-dog.jpg',contentType:'image/jpeg'}));
  await page.addInitScript(() => {
    const vector=(n:number,value=1)=>Array.from({length:n},(_,i)=>i===0?value:0);
    const features={kind:'dog',view:'front',viewSource:'user',box:[.1,.1,.6,.6],detectionScore:.9,appearance:vector(1024),mirroredAppearance:vector(1024),color:vector(120),shape:vector(10)};
    const people:{id:number;name:string;media_ids:number[];cover_face_id?:number}[]=[{id:1,name:'가족',media_ids:[2],cover_face_id:11},{id:2,name:'수동 등록',media_ids:[3]}];
    const faces:{id:number;media_id:number;person_id:number;thumbnail:string;confirmed:boolean}[]=[{id:11,media_id:1,person_id:1,thumbnail:'/manual-photo.jpg',confirmed:true}];
    const pets=[{id:1,name:'보리',media_ids:[1],cover_media_id:1}];
    const detections:any[]=[{...features,id:1,media_id:1,pet_id:1,excluded:false}];
    let jobs:any[]=[],nextJob=1;
    const remember=(key:string,value:any)=>localStorage.setItem(key,JSON.stringify(value));
    class FixtureWorker extends EventTarget {
      domain:string; stopped=false;
      constructor(url:any){super();this.domain=String(url).includes('person.worker')?'person':'pet';}
      postMessage(message:any){
        const kind=this.domain;
        setTimeout(()=>{
          if(this.stopped)return;
          const face={descriptor:Array(128).fill(.1),thumbnail:'data:image/jpeg;base64,AA==',modelVersion:'face-api-1.7.15-ssd-68-resnet-v1',box:[.1,.1,.2,.2],quality:'usable',pose:{version:'landmarks-pnp-v1',view:'left',yawDegrees:-40,pitchDegrees:0,rollDegrees:0,quality:'estimated',normalizedError:.01},additionalFeatures:[{modelVersion:'facex-tiny-512-af7ca993-v1',dimensions:512,descriptor:Array(512).fill(.1)}]};
          const fresh=(message.regions??[features]).map((region:any)=>({...region,appearance:vector(1024,.5),mirroredAppearance:vector(1024,.5)}));
          this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,faces:message.pixels?[face]:[],features:fresh,diagnostics:{backend:'wasm',elapsedMs:1,modelLoadMs:0,tensors:1,tensorBytes:1,simd:true}}}));
        },Number(localStorage.getItem('worker-delay')??'10'));
        remember(`${kind}-worker-inputs`,Number(localStorage.getItem(`${kind}-worker-inputs`)??'0')+Number(!!message.pixels));
      }
      terminate(){this.stopped=true;}
    }
    Object.defineProperty(window,'Worker',{value:FixtureWorker,configurable:true});
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/manual-photo.jpg',invoke:async(command:string,args:any={})=>{
      if(command==='list_media')return Array.from({length:31},(_,i)=>({id:i+1,file_path:`/photos/photo${i+1}.jpg`,file_type:i===30?'video':'image',taken_at:'2026-10-11',width:768,height:576,size_bytes:1000,rating:0,comment:'',favorite:false,metadata_status:'ready'}));
      if(command==='list_face_index')return structuredClone({people,faces,scanned:[1,2,3]});
      if(command==='save_manual_person_photos'){
        if(localStorage.getItem('fail-manual'))throw '저장 실패 · 다시 저장해 주세요.'; // Native command errors arrive as strings.
        const id=args.personId??Math.max(...people.map(row=>row.id))+1;
        const owner=people.find(row=>row.id===id);if(owner)owner.media_ids=args.mediaIds;else people.push({id,name:args.name,media_ids:args.mediaIds});remember('saved-person', {id,ids:args.mediaIds});return id;
      }
      if(command==='get_person_scan_source')return {source_key:'sha256:'+'a'.repeat(64),completed:true,legacy:false};
      if(command==='refresh_face_scan'){
        remember('person-refresh-ids',[...JSON.parse(localStorage.getItem('person-refresh-ids')??'[]'),args.mediaId]);
        const owner=people.find(row=>row.media_ids.includes(args.mediaId));
        if(owner&&!faces.some(row=>row.media_id===args.mediaId))faces.push({id:100+args.mediaId,media_id:args.mediaId,person_id:owner.id,thumbnail:'/manual-photo.jpg',confirmed:true});
        return {detected:args.faces.length,learned:1};
      }
      if(command==='list_pets')return structuredClone(pets);
      if(command==='save_pet'){const owner=pets.find(row=>row.id===args.id)!;owner.media_ids=args.mediaIds;owner.cover_media_id=args.coverMediaId;remember('saved-pet',args.mediaIds);return owner.id;}
      if(command==='list_pet_jobs')return structuredClone({jobs:jobs.slice(0,100),pending:jobs.filter(row=>row.state==='pending').length,paused:jobs.filter(row=>row.state==='paused').length,failed:jobs.filter(row=>row.state==='failed').length});
      if(command==='enqueue_pet_jobs'){
        remember('pet-enqueued',[...JSON.parse(localStorage.getItem('pet-enqueued')??'[]'),...args.jobs]);
        for(const input of args.jobs){const old=jobs.find(row=>row.media_id===input.mediaId&&row.pet_id===input.petId);if(!old)jobs.push({id:nextJob++,media_id:input.mediaId,pet_id:input.petId,view:input.view,state:'pending',error:'',refresh:input.refresh});else if(input.refresh){old.refresh=true;old.state='pending';}}return;
      }
      if(command==='finish_pet_job'){if(args.error){const row=jobs.find(row=>row.id===args.id);if(row){row.state='failed';row.error=args.error;}}else jobs=jobs.filter(row=>row.id!==args.id);return;}
      if(command==='control_pet_jobs'){for(const row of jobs)row.state=args.resume?'pending':'paused';return;}
      if(command==='prepare_pet_input')return {path:'/manual-photo.jpg',sourceKey:'sha256:'+'a'.repeat(64)};
      if(command==='get_pet_scan')return detections.some(row=>row.media_id===args.mediaId)?structuredClone({media_id:args.mediaId,engine_version:'gamjassak-pets-v2',source_key:'sha256:'+'a'.repeat(64),detections:detections.filter(row=>row.media_id===args.mediaId)}):null;
      if(command==='replace_pet_scan'||command==='save_pet_scan'){
        if(!detections.some(row=>row.media_id===args.mediaId))detections.push({...args.features[0],id:args.mediaId,media_id:args.mediaId,pet_id:null,excluded:false});
        return structuredClone({media_id:args.mediaId,engine_version:'gamjassak-pets-v2',source_key:'sha256:'+'a'.repeat(64),detections:detections.filter(row=>row.media_id===args.mediaId)});
      }
      if(command==='refresh_pet_reference'){Object.assign(detections.find(row=>row.id===args.detectionId),args.features);remember('pet-refreshed',args.detectionId);return;}
      if(command==='confirm_pet_detection'){const row=detections.find(row=>row.id===args.detectionId);row.pet_id=args.petId;return;}
      return [];
    }}});
  });
  await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
}

test('person manual photos coexist with detected faces and preserve selection on retry',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'가족 2장',exact:true}).click();
  await page.getByRole('button',{name:'사진 연결',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'사진 연결',exact:true});
  await expect(dialog.locator('[data-selection-id="1"]')).toBeDisabled();
  await expect(dialog.locator('[data-selection-id="1"]')).toHaveAttribute('aria-pressed','true');
  await dialog.locator('[data-selection-id="3"]').click();await page.evaluate(()=>localStorage.setItem('fail-manual','1'));
  await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('저장 실패');
  await expect(dialog.locator('[data-selection-id="3"]')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>localStorage.removeItem('fail-manual'));await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('saved-person')!))).toEqual({id:1,ids:[2,3]});
  await expect(page.locator('.peopleView > .entityHeader')).toContainText('사진 3장');
  await expect(page.locator('.peopleView .personMediaGrid').getByRole('button',{name:'사진 상세보기',exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'사진 연결',exact:true}).click();dialog=page.getByRole('dialog',{name:'사진 연결',exact:true});await dialog.locator('[data-selection-id="2"]').click();await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('saved-person')!))).toEqual({id:1,ids:[3]});
  await expect(page.locator('.peopleView > .entityHeader')).toContainText('사진 2장');
});

test('a new person can be registered without faces across picker pages',async({page,isMobile})=>{
  await prepare(page);if(isMobile){await page.setViewportSize({width:320,height:851});await page.getByRole('button',{name:'크게 보기',exact:true}).click();}
  await page.getByRole('button',{name:'인물 추가',exact:true}).click();const dialog=page.getByRole('dialog',{name:'인물 추가',exact:true});
  await dialog.getByLabel('등록할 이름').fill('감지 없는 사람');await dialog.locator('[data-selection-id="2"]').click();await dialog.getByRole('button',{name:'다음 사진',exact:true}).click();await dialog.locator('[data-selection-id="25"]').click();
  await expect(dialog.getByRole('status')).toHaveText('사진 2장 선택');await expect(dialog.locator('[data-selection-id="31"]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(dialog.locator('.entityEditFooter')).toBeInViewport();
  await page.screenshot({path:`preview-results/manual-photo-picker-${isMobile?'mobile':'desktop'}.png`});
  await dialog.getByRole('button',{name:'사진 저장',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('.peopleView > .entityHeader')).toContainText('감지 없는 사람');await expect(page.locator('.peopleView .personMediaGrid').getByRole('button',{name:'사진 상세보기',exact:true})).toHaveCount(2);
  expect(await page.evaluate(()=>localStorage.getItem('person-worker-inputs'))).toBeNull();
});

test('confirmed person photos are not offered for reanalysis or training',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'수동 등록 1장',exact:true}).click();
  await expect(page.getByRole('button',{name:/등록.*다시 (분석|학습)/})).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('person-worker-inputs'))).toBeNull();
});

test('pet manual photos can be changed and refreshed through the durable queue',async({page})=>{
  await prepare(page);await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'보리 1장',exact:true}).click();
  await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();let dialog=page.getByRole('dialog',{name:'반려동물 편집',exact:true});await dialog.locator('[data-selection-id="2"]').click();await dialog.getByRole('button',{name:'취소',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('saved-pet'))).toBeNull();
  await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();dialog=page.getByRole('dialog',{name:'반려동물 편집',exact:true});await dialog.locator('[data-selection-id="2"]').click();await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('.petsView > .entityHeader')).toContainText('사진 2장');
  await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();await page.getByRole('button',{name:'등록 사진 다시 분석',exact:true}).click();await expect(page.locator('.petsView .petAnalysisNotice')).toContainText('다시 분석 완료');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pet-enqueued')!).map((row:any)=>[row.mediaId,row.petId,row.refresh]))).toEqual([[1,1,true],[2,1,true]]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pet-refreshed')!))).toBe(1);
  const kept=await page.evaluate(async()=>({pets:await (window as any).__TAURI_INTERNALS__.invoke('list_pets'),scan:await (window as any).__TAURI_INTERNALS__.invoke('get_pet_scan',{mediaId:1})}));expect(kept.pets[0].media_ids).toEqual([1,2]);expect(kept.scan.detections[0]).toMatchObject({id:1,pet_id:1,view:'front',viewSource:'user'});expect(kept.scan.detections[0].appearance[0]).toBe(.5);
  await page.evaluate(()=>localStorage.setItem('worker-delay','500'));await page.getByRole('button',{name:'반려동물 관리',exact:true}).click();await page.getByRole('button',{name:'등록 사진 다시 분석',exact:true}).click();await page.locator('.petsView .petAnalysisNotice').getByRole('button',{name:'분석 중단',exact:true}).click();await expect(page.locator('.petsView .petAnalysisNotice').getByRole('button',{name:'이어서 분석',exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('worker-delay'));await page.locator('.petsView .petAnalysisNotice').getByRole('button',{name:'이어서 분석',exact:true}).click();await expect(page.locator('.petsView .petAnalysisNotice')).toContainText('다시 분석 완료');
});
