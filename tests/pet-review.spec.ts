import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('multiple animals, rear confirmation, correction and registration preserve person index',async({page})=>{
 const thumbnail=`data:image/jpeg;base64,${(await readFile('tests/fixtures/pet-dog.jpg')).toString('base64')}`;
 await page.addInitScript(({thumbnail})=>{
  let pets:{id:number;name:string;cover_media_id:number|null;media_ids:number[]}[]=[{id:1,name:'보리',cover_media_id:1,media_ids:[1]},{id:2,name:'초코',cover_media_id:null,media_ids:[]}];
  const base={kind:'dog',view:'unknown',viewSource:'unknown',box:[0.05,0.1,0.4,0.8],detectionScore:0.9,appearance:Array(1024).fill(0).map((_,i)=>Number(i===0)),mirroredAppearance:Array(1024).fill(0).map((_,i)=>Number(i===0)),color:Array(120).fill(0).map((_,i)=>Number(i===0)),shape:Array(10).fill(0).map((_,i)=>Number(i===0))};
  const detections=[{...base,id:1,media_id:1,pet_id:1,excluded:false},{...base,id:2,media_id:2,pet_id:null,excluded:false},{...base,id:3,media_id:2,pet_id:null,excluded:false,box:[0.55,0.1,0.4,0.8]}];
  Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>thumbnail,invoke:async(command:string,args:any)=>{
   if(command==='list_media')return [1,2].map(id=>({id,file_path:`C:/pet/${id}.jpg`,file_type:'image',taken_at:'2026-10-09',size_bytes:1000,rating:0,comment:'',favorite:false,metadata_status:'ready'}));
   if(command==='list_albums'||command==='list_diary')return [];
   if(command==='list_face_index')return {people:[],faces:[],scanned:[]};
   if(command==='media_thumbnail')return 'C:/thumb.jpg';
   if(command==='list_pets')return pets;
   if(command==='get_pet_scan')return {media_id:args.mediaId,engine_version:'gamjassak-pets-v1',source_key:'mock',detections:detections.filter(d=>d.media_id===args.mediaId)};
   if(command==='list_pet_detections')return detections.filter(d=>(args.mediaId===null||d.media_id===args.mediaId)&&d.id>args.afterId&&(!args.references||(d.pet_id!==null&&!d.excluded)));
   if(command==='save_pet'){const id=args.id??3;pets=[...pets.filter(p=>p.id!==id),{id,name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId}];return id;}
   if(command==='confirm_pet_detection'){
    const row=detections.find(d=>d.id===args.detectionId)!;row.pet_id=args.petId;row.view=args.view;row.viewSource=args.view==='unknown'?'unknown':'user';row.excluded=args.excluded;
    if(row.view==='rear'){row.appearance=[];row.mirroredAppearance=[];}
    const pet=pets.find(p=>p.id===args.petId);if(pet&&!pet.media_ids.includes(row.media_id))pet.media_ids.push(row.media_id);
    localStorage.setItem('pet-confirmed-test',JSON.stringify(detections));
   }
  }}});
 },{thumbnail});
 await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();
 await page.getByRole('button',{name:'반려동물 인식 결과 확인',exact:true}).click();
 const review=page.getByRole('dialog',{name:'반려동물 인식 결과 확인'});
 await expect(review.locator('.petDetectionCard')).toHaveCount(3);
 const second=review.locator('.petDetectionCard').nth(1);
 await second.getByLabel('촬영 방향',{exact:true}).selectOption('rear');await expect(second.getByText('뒷모습 분석 · 확인 필요',{exact:true})).toBeVisible();
 await second.getByLabel('인식된 반려동물',{exact:true}).selectOption('1');await second.getByRole('button',{name:'확인 저장',exact:true}).click();
 await expect(second.getByText('연결 완료 · 변경 가능',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pet-confirmed-test')!)[1].appearance.length)).toBe(0);
 await second.getByLabel('인식된 반려동물',{exact:true}).selectOption('2');await second.getByRole('button',{name:'확인 저장',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pet-confirmed-test')!)[1].pet_id)).toBe(2);
 const third=review.locator('.petDetectionCard').nth(2);await third.getByLabel('촬영 방향',{exact:true}).selectOption('left');await third.getByLabel('인식된 반려동물',{exact:true}).selectOption('new');await third.getByLabel('새 반려동물 이름',{exact:true}).fill('콩이');await third.getByRole('button',{name:'확인 저장',exact:true}).click();
 await expect(third.getByText('연결 완료 · 변경 가능',{exact:true})).toBeVisible();
 await third.getByRole('button',{name:'반려동물 아님',exact:true}).click();await expect(third.getByText('탐지 제외 · 변경 가능',{exact:true})).toBeVisible();await third.getByRole('button',{name:'확인 저장',exact:true}).click();
 await page.screenshot({path:`test-results/pet-review-${test.info().project.name}.png`});
 await review.getByTitle('닫기').click();await page.getByRole('tab',{name:'사람',exact:true}).click();await expect(page.getByRole('button',{name:'인물 등록',exact:true})).toBeVisible();
});
