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
 await page.screenshot({path:`preview-results/pet-review-${test.info().project.name}.png`});
 await review.getByTitle('닫기').click();await page.getByRole('tab',{name:'사람',exact:true}).click();await expect(page.getByRole('button',{name:'사진에서 사람 찾기',exact:true}).first()).toBeVisible();
});

test('face region controls and independent evaluation labels stay usable',async({page})=>{
 await page.addInitScript(()=>{
 const feature={kind:'dog',view:'front',viewSource:'user',box:[0.05,0.1,0.8,0.8],detectionScore:0.9,appearance:Array(1024).fill(0),mirroredAppearance:Array(1024).fill(0),color:Array(120).fill(0),shape:Array(10).fill(0),id:1,media_id:1,pet_id:1,excluded:false};
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'',invoke:async(command:string,args:any)=>{
 if(command==='list_media')return [{id:1,file_path:'C:/pet.jpg',file_type:'image',taken_at:'2026-10-10',size_bytes:1000,rating:0,comment:'',favorite:false,metadata_status:'ready'}];
 if(command==='list_pets')return [{id:1,name:'보리',media_ids:[1],cover_media_id:1}];
 if(command==='list_pet_detections')return [feature];
 if(command==='get_pet_scan')return {source_key:'sha256:test',detections:[feature]};
 if(command==='pet_evaluation_summary')return {references:1,queries:2};
 if(command==='get_pet_evaluation_dataset')return {references:[{sampleId:'r',captureGroup:'enroll',sourceKey:'r',petId:1,kind:'dog',view:'front',features:feature}],queries:[{sampleId:'q',captureGroup:'test',sourceKey:'q',petId:1,kind:'dog',view:'left',features:null}]};
 if(command==='list_pet_jobs')return {pending:1,paused:0,failed:0,jobs:[]};
 if(command==='save_pet_evaluation'){localStorage.setItem('evaluation-sample',JSON.stringify(args.sample));return;}
 if(command==='list_face_index')return {people:[],faces:[],scanned:[]};
 if(command==='list_media'||command==='list_albums'||command==='list_diary')return [];
 }}});
 });
 await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'반려동물 인식 결과 확인',exact:true}).click();
 const review=page.getByRole('dialog',{name:'반려동물 인식 결과 확인'});
 await review.getByRole('button',{name:'얼굴 영역 지정',exact:true}).click();await expect(review.getByRole('button',{name:'얼굴 지정 마침',exact:true})).toHaveAttribute('aria-pressed','true');
 await review.getByLabel('촬영 방향',{exact:true}).selectOption('rear');await expect(review.getByRole('button',{name:'얼굴 영역 지정',exact:true})).toHaveCount(0);
 await review.getByRole('button',{name:'검증 자료 만들기',exact:true}).click();const panel=review.getByRole('region',{name:'반려동물 검증 자료'});
 await panel.getByLabel('실제 반려동물',{exact:true}).selectOption('1');await panel.getByLabel('실제 촬영 방향',{exact:true}).selectOption('left');await panel.getByLabel('촬영 세션 이름',{exact:true}).fill('별도 산책 세션');await panel.getByLabel('사진 사용 권리·출처',{exact:true}).fill('직접 촬영');await panel.getByRole('button',{name:'검증 자료에 추가',exact:true}).click();
 await expect(panel.getByText(/사진 연결과 인식 기준은 변경하지 않았습니다/)).toBeVisible();
 const sample=await page.evaluate(()=>JSON.parse(localStorage.getItem('evaluation-sample')!));expect(sample.detectionId).toBeNull();expect(sample.petId).toBe(1);expect(sample.view).toBe('left');expect(sample.role).toBe('query');
 await panel.getByRole('button',{name:'검증 결과 확인',exact:true}).click();await expect(panel.getByText('옆모습 60% 목표: 자료 부족 · 판단 보류',{exact:true})).toBeVisible();
 const performance=review.getByRole('region',{name:'이 기기 처리 속도 측정'});await performance.getByRole('button',{name:'이 기기에서 측정',exact:true}).click();await expect(performance.getByText('진행 중인 사진 분석을 먼저 마치거나 중단해 주세요.',{exact:true})).toBeVisible();
 await page.screenshot({path:`preview-results/pet-evaluation-${test.info().project.name}.png`});
});
