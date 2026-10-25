import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, count = 2) {
  await page.addInitScript(({ count }) => {
    const people = [{id:7,name:'가족',media_ids:[11],cover_face_id:11},{id:8,name:'',media_ids:[] as number[],cover_face_id:13}];
    const ids = [13,15,...Array.from({length:count-2},(_,i)=>100+i)];
    const faces = [
      {id:11,person_id:7,confirmed:true},{id:12,person_id:7,confirmed:false},
      {id:14,person_id:8,confirmed:true},...ids.map(id=>({id,person_id:8,confirmed:false})),
    ].map(face=>({...face,media_id:face.id,thumbnail:'/favicon.svg'}));
    const previous=JSON.parse(localStorage.getItem('unknown-state')??'null');
    if(previous){people.splice(0,people.length,...previous.people);faces.splice(0,faces.length,...previous.faces);}
    const remember = () => localStorage.setItem('unknown-state',JSON.stringify({people,faces}));
    remember();
    Object.defineProperty(window,'Worker',{value:class { constructor(){throw new Error('Candidate review must not run inference');} }});
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/favicon.svg',invoke:async(command:string,args:any={})=>{
        if (command === 'check_android_location_setup') return { locationEnabled: true, photoLocationGranted: true };
      const calls=JSON.parse(localStorage.getItem('unknown-calls')??'[]');calls.push({command,args});localStorage.setItem('unknown-calls',JSON.stringify(calls));
      if(command==='list_media')return faces.map(face=>({id:face.media_id,file_path:`/photo${face.id}.jpg`,file_type:'image',taken_at:'2026-10-22',size_bytes:1,rating:0,comment:'',favorite:false,metadata_status:'ready'}));
      if(command==='list_face_index'){
        if(localStorage.getItem('fail-next-index')){localStorage.removeItem('fail-next-index');throw 'temporary reload failure';}
        return structuredClone({people,faces,scanned:faces.map(face=>face.media_id)});
      }
      if(command==='find_face_matches')return [11,12,13,14].map(face_id=>({face_id,person_id:7})); // Stale/noneligible results must also be hidden by the view.
      if(command==='assign_person_faces'){
        if(localStorage.getItem('fail-registration'))throw 'temporary write failure';
        const id=args.target??Math.max(...people.map(person=>person.id))+1;
        if(args.target===null)people.push({id,name:args.name,media_ids:[],cover_face_id:args.ids[0]});
        faces.forEach(face=>{if(args.ids.includes(face.id)){face.person_id=id;face.confirmed=true;}});
        if(localStorage.getItem('fail-reload-after-save')){localStorage.removeItem('fail-reload-after-save');localStorage.setItem('fail-next-index','1');}
        remember();return id;
      }
      if(command==='rename_face_person'){people.find(person=>person.id===args.id)!.name=args.name;remember();return;}
      if(command==='move_faces'){faces.forEach(face=>{if(args.ids.includes(face.id)){face.person_id=args.target;face.confirmed=true;}});remember();return;}
      if(command==='refresh_face_scan'||command==='clear_face_index'||command==='retry_empty_face_scans')throw new Error('Review must preserve existing scans');
      return [];
    }}});
  },{count});
  await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
}
async function review(page: Page) {
  await page.getByRole('button',{name:'미확인 인물 다시 확인',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'미확인 인물 다시 확인',exact:true});
  const summary=dialog.locator('.faceMatchSummary').getByRole('status');
  await expect(summary).toContainText(/미확인 얼굴 \d+개/);
  await expect(summary).toContainText(/이름 추천 \d+개/);
  return dialog;
}

test('review compares only unconfirmed unnamed faces and preserves other assignments',async({page})=>{
  await prepare(page);const dialog=await review(page);
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.getByLabel('미확인 얼굴 11 선택')).toHaveCount(0);
  await expect(dialog.getByLabel('미확인 얼굴 12 선택')).toHaveCount(0);
  await expect(dialog.getByLabel('미확인 얼굴 14 선택')).toHaveCount(0);
  await dialog.getByLabel('미확인 얼굴 13 선택').check();
  await dialog.getByRole('button',{name:'추천 이름으로 저장 (1)',exact:true}).click();await expect(dialog).toBeHidden();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!));
  expect(state.faces.filter((face:any)=>[11,12,14].includes(face.id)).map((face:any)=>[face.id,face.person_id,face.confirmed])).toEqual([[11,7,true],[12,7,false],[14,8,true]]);
  expect(state.faces.find((face:any)=>face.id===13)).toMatchObject({person_id:7,confirmed:true});
  expect(state.people[0].media_ids).toEqual([11]);
  const calls=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-calls')!));
  expect(calls.filter((call:any)=>/refresh_face_scan|save_face_scan|get_person_scan_source/.test(call.command))).toEqual([]);
});

test('faces without suggestions can be selected across pages and registered with a new name',async({page,isMobile})=>{
  await prepare(page,27);if(isMobile)await page.setViewportSize({width:360,height:800});const dialog=await review(page);
  await dialog.getByLabel('미확인 얼굴 13 선택').check();await dialog.getByLabel('미확인 얼굴 15 선택').check();
  await dialog.getByRole('button',{name:'다음 페이지',exact:true}).click();await dialog.getByRole('checkbox').first().check();
  await expect(dialog.getByText('3개 선택',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'이름 지정',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`preview-results/people-controls-unknown-face-review-${isMobile?'mobile':'desktop'}.png`});
  await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();
  const form=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await form.getByRole('button',{name:'새 인물',exact:true}).click();
  await expect(form.getByRole('button',{name:'이름 지정',exact:true})).toBeDisabled();
  await form.getByLabel('새 인물 이름').fill('새 친구');
  await expect(form.getByRole('button',{name:'이름 지정',exact:true})).toBeInViewport();
  await page.screenshot({path:`preview-results/people-controls-unknown-face-name-${isMobile?'mobile':'desktop'}.png`});
  await form.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(form).toBeHidden();
  await page.locator('.entityHeader').getByRole('button',{name:'선택 취소',exact:true}).click();
  await page.getByRole('complementary',{name:'이름을 지정한 사람'}).getByRole('button',{name:'새 친구 사진 3장',exact:true}).click();
  await expect(page.locator('.peopleView > .entityHeader').getByRole('heading',{name:'새 친구',exact:true})).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!));
  const added=state.people.find((person:any)=>person.name==='새 친구');expect(added).toBeTruthy();
  expect(state.faces.filter((face:any)=>face.person_id===added.id)).toHaveLength(3);
  expect(state.faces.find((face:any)=>face.id===14)).toMatchObject({person_id:8,confirmed:true});
});

test('new face registration keeps a failed draft and does not repeat a committed save after reload failure',async({page})=>{
  await prepare(page);const dialog=await review(page);await dialog.getByLabel('미확인 얼굴 15 선택').check();
  await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();
  const form=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await form.getByRole('button',{name:'새 인물',exact:true}).click();await form.getByLabel('새 인물 이름').fill('복구 확인');
  await page.evaluate(()=>localStorage.setItem('fail-registration','1'));await form.getByRole('button',{name:'이름 지정',exact:true}).click();
  await expect(form.getByRole('alert')).toBeVisible();await expect(form.getByLabel('새 인물 이름')).toHaveValue('복구 확인');
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!))).people).toHaveLength(2);
  await page.evaluate(()=>{localStorage.removeItem('fail-registration');localStorage.setItem('fail-reload-after-save','1');});
  await form.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('저장은 완료했지만 목록을 갱신하지 못했습니다.');
  await expect(page.getByRole('region',{name:'선택한 얼굴 관리',exact:true})).toContainText('얼굴 0개 선택');
  await page.reload();
  await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('button',{name:'복구 확인 1장',exact:true}).click();
  await expect(page.getByRole('heading',{name:'복구 확인',exact:true})).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!));expect(state.people.filter((person:any)=>person.name==='복구 확인')).toHaveLength(1);
  const calls=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-calls')!));expect(calls.filter((call:any)=>call.command==='assign_person_faces')).toHaveLength(2); // One failed write and one committed write, no duplicate on reload retry.
});


test('face overview selection keeps chosen faces when naming is cancelled',async({page})=>{
  await prepare(page);
  await page.getByRole('button',{name:'얼굴 관리',exact:true}).click();
  await page.getByRole('button',{name:'얼굴 선택하기',exact:true}).click();
  await page.locator('.personPhoto[data-selection-id="13"] button').click();await page.locator('.personPhoto[data-selection-id="15"] button').click();
  await page.getByRole('region',{name:'선택한 얼굴 관리',exact:true}).getByRole('button',{name:'이름 지정',exact:true}).click();
  const form=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await form.getByRole('button',{name:'새 인물',exact:true}).click();await form.getByLabel('새 인물 이름').fill('취소할 이름');
  page.once('dialog',dialog=>dialog.accept());
  await form.getByRole('button',{name:'취소',exact:true}).click();await expect(form).toBeHidden();
  await expect(page.getByRole('region',{name:'선택한 얼굴 관리',exact:true})).toContainText('얼굴 2개 선택');
  await expect(page.locator('.personPhoto button[aria-pressed="true"]')).toHaveCount(2);
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!))).people).toHaveLength(2);
});

test('review drag selection preserves ordinary touch scrolling',async({page,isMobile})=>{
  await prepare(page,27);const dialog=await review(page);
  const body=dialog.locator('.faceMatchBody');
  if(isMobile){
    const client=await page.context().newCDPSession(page),box=(await body.boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height-40;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=6;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*20}]});await page.waitForTimeout(20);}
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);await expect(dialog.getByRole('checkbox',{checked:true})).toHaveCount(0);
    await body.evaluate(el=>{el.scrollTop=0;});
    const a=(await dialog.locator('[data-selection-id="13"] img').boundingBox())!,b=(await dialog.locator('[data-selection-id="15"] img').boundingBox())!;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});await page.waitForTimeout(550);
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  }else{
    const a=(await dialog.locator('[data-selection-id="13"] img').boundingBox())!,b=(await dialog.locator('[data-selection-id="15"] img').boundingBox())!;
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();
  }
  await expect(dialog.getByRole('checkbox',{checked:true})).toHaveCount(2);
});

test('a committed save clears the obsolete face selection even when reloading the list fails',async({page})=>{
  await prepare(page);const dialog=await review(page);await dialog.getByLabel('미확인 얼굴 15 선택').check();
  await dialog.getByRole('button',{name:'이름 지정',exact:true}).click();
  const form=page.getByRole('dialog',{name:'이름 지정',exact:true});
  await form.getByRole('button',{name:'새 인물',exact:true}).click();await form.getByLabel('새 인물 이름').fill('저장된 인물');
  await page.evaluate(()=>localStorage.setItem('fail-reload-after-save','1'));
  await form.getByRole('button',{name:'이름 지정',exact:true}).click();await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('저장은 완료했지만 목록을 갱신하지 못했습니다.');
  await expect(page.getByRole('region',{name:'선택한 얼굴 관리',exact:true})).toContainText('얼굴 0개 선택');
  await expect(page.getByRole('region',{name:'선택한 얼굴 관리',exact:true}).getByRole('button',{name:'이름 지정',exact:true})).toBeDisabled();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('unknown-state')!));
  expect(state.people.filter((person:any)=>person.name==='저장된 인물')).toHaveLength(1);
  expect(state.faces.find((face:any)=>face.id===15).confirmed).toBe(true);
});
