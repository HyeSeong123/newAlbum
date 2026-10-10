import {test,expect} from '@playwright/test';
test('local person evaluation records explicit truth without moving faces',async({page})=>{
 await page.addInitScript(()=>{
  const counts={references:0,queries:0};
  Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/favicon.svg',invoke:async(command:string,args:{sample?:{role:string;captureGroup:string;category:string;personId:number|null;faceId:number|null}})=>{
   if(command==='list_media')return [1,2].map(id=>({id,file_path:`photo${id}.jpg`,file_type:'image',taken_at:'2026-10-10',size_bytes:1,rating:0,comment:'',favorite:false,metadata_status:'ready'}));
   if(command==='list_face_index')return {people:[{id:7,name:'가족'}],faces:[{id:11,media_id:1,person_id:7,thumbnail:'/favicon.svg',confirmed:true}],scanned:[1,2]};
   if(command==='person_evaluation_summary')return {...counts};
   if(command==='save_person_evaluation'){const s=args.sample!;if(!s.captureGroup)throw new Error('Session required');counts[s.role==='reference'?'references':'queries']++;document.documentElement.dataset.personEvaluation=JSON.stringify(s);}
   if(command==='move_faces'||command==='rename_face_person'||command==='save_face_scan')throw new Error('Evaluation must not edit identity links');
   return [];
  }}});
 });
 await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('button',{name:'얼굴 관리',exact:true}).click();await page.getByRole('button',{name:'인식 검증·기기 측정',exact:true}).click();
 const panel=page.getByRole('region',{name:'인물 정확도 평가'});await expect(panel.getByRole('button',{name:'인물 평가 자료에 추가'})).toBeDisabled();
 await panel.getByLabel('인물 자료 용도').selectOption('reference');await panel.getByLabel('실제 인물',{exact:true}).selectOption('7');await panel.getByLabel('인물 촬영 세션').fill('A');await panel.getByLabel('인물 사진 사용 권리·출처').fill('owner and subject consent');await expect(panel.getByRole('button',{name:'인물 평가 자료에 추가'})).toBeDisabled();
 await panel.getByRole('radio',{name:'평가 얼굴 1',exact:true}).check();await panel.getByRole('button',{name:'인물 평가 자료에 추가'}).click();await expect(panel.getByRole('status')).toContainText('등록 기준 1개');
 await panel.getByLabel('평가 사진',{exact:true}).selectOption('2');await panel.getByLabel('인물 자료 용도').selectOption('query');await panel.getByLabel('인물 평가 조건').selectOption('left');await panel.getByLabel('인물 촬영 세션').fill('B');await panel.getByRole('button',{name:'인물 평가 자료에 추가'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-person-evaluation',/"faceId":null/);await expect(panel.getByRole('status')).toContainText('평가 1개');
 await expect(panel.getByRole('button',{name:'인물 평가 결과 확인'})).toBeEnabled();await expect(page.getByRole('button',{name:'가족 1장',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
