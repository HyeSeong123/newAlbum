import {test,expect} from '@playwright/test';
test('advanced evaluation is in settings and keeps automatic and manual directions separate',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/favicon.svg',invoke:async(command:string,args?:{view?:string})=>{
  if(command==='list_media')return [{id:1,file_path:'photo.jpg',file_type:'image',taken_at:'2026-10-10',size_bytes:1,rating:0,comment:'',favorite:false,metadata_status:'ready'}];
  if(command==='list_face_index')return {people:[{id:7,name:'가족'}],faces:[{id:11,media_id:1,person_id:7,thumbnail:'/favicon.svg',confirmed:true,pose:{automatic:{view:'left',quality:'estimated',yawDegrees:40},manualView:null}}],scanned:[1]};
  if(command==='person_evaluation_summary')return {references:0,queries:0};
  if(command==='set_person_face_view'){document.documentElement.dataset.manualView=args?.view;return;}
  if(command==='move_faces'||command==='rename_face_person'||command==='save_face_scan')throw new Error('Direction correction must preserve links');
  return [];
 }}}));
 await page.goto('/');await page.locator('.globalSettings').click();
 await page.getByRole('button',{name:'인식 검증 열기 · 고급',exact:true}).click();
 await expect(page.getByText('실제 512차원 모델 포함',{exact:false})).toBeVisible();
 const panel=page.getByRole('region',{name:'인물 정확도 평가'});
 await panel.getByRole('radio',{name:'평가 얼굴 1',exact:true}).check();
 await expect(panel).toContainText('자동 방향: 왼쪽을 봄');
 await panel.getByLabel('이 얼굴의 방향 수정').selectOption('right');
 await expect(page.locator('html')).toHaveAttribute('data-manual-view','right');
 await expect(panel).toContainText('자동 방향: 왼쪽을 봄');
 await expect(panel).toContainText('자동 추정 결과와 평가 정답은 유지됩니다.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
