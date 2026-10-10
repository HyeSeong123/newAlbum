import {test,expect} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
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
test('person device measurement cancels, restarts and compares both local backends without saving links',async({page,isMobile})=>{
 test.skip(isMobile,'Model exercised once; narrow evaluation UI is tested separately.');test.setTimeout(180_000);
 await page.route('**/face-input.jpg',route=>route.fulfill({path:'node_modules/@vladmandic/face-api/demo/sample1.jpg',contentType:'image/jpeg'}));
 await page.addInitScript(()=>{
  Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/face-input.jpg',invoke:async(command:string)=>{
   if(command==='list_media')return [{id:1,file_path:'fixture.jpg',file_type:'image',taken_at:'2026-10-10',size_bytes:1,rating:0,comment:'',favorite:false,metadata_status:'ready'}];
   if(command==='list_face_index')return {people:[],faces:[],scanned:[1]};
   if(command==='person_evaluation_summary')return {references:0,queries:0};
   if(command==='get_person_scan_source')return {source_key:'sha256:fixture',completed:true};
   if(command==='person_runtime_environment')return {os:'test-browser',architecture:'x86_64',version:'test'};
   if(command==='save_face_scan'||command==='move_faces'||command==='rename_face_person')throw new Error('Benchmark must not save');
   return [];
  }}});
 });
 await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('button',{name:'얼굴 관리',exact:true}).click();await page.getByRole('button',{name:'인식 검증·기기 측정',exact:true}).click();
 const panel=page.getByRole('region',{name:'이 기기 인물 처리 속도'});await panel.getByRole('button',{name:'이 기기 인물 속도 측정',exact:true}).click();await panel.getByRole('button',{name:'인물 측정 중단',exact:true}).click();await expect(panel).toContainText('인물 측정을 중단했습니다.');
 await panel.getByRole('button',{name:'이 기기 인물 속도 측정',exact:true}).click();await expect(panel).toContainText('CPU 추론 중앙값',{timeout:120_000});await expect(panel).toContainText('WASM');await expect(panel).toContainText('test-browser · x86_64');await expect(panel).toContainText('모델 텐서 최대');
 await expect(page.getByRole('button',{name:'얼굴 관리',exact:true})).toBeEnabled();
});
test('source audit keeps identity links and shows changed originals',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>'/favicon.svg',invoke:async(command:string)=>{
  if(command==='list_media')return [{id:1,file_path:'photo.jpg',file_type:'image',taken_at:'2026-10-10',size_bytes:1,rating:0,comment:'',favorite:false,metadata_status:'ready'}];
  if(command==='list_face_index')return {people:[{id:7,name:'가족'}],faces:[{id:11,media_id:1,person_id:7,thumbnail:'/favicon.svg',confirmed:true}],scanned:[1]};
  if(command==='person_evaluation_summary')return {references:0,queries:0};
  if(command==='audit_person_scans')return {items:[{mediaId:1,state:'source_changed'}],nextCursor:1,done:true};
  if(['move_faces','save_face_scan','clear_face_index'].includes(command))throw new Error('Audit cannot change identity');
  return [];
 }}}));
 await page.goto('/');await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('button',{name:'얼굴 관리',exact:true}).click();await page.getByRole('button',{name:'인식 검증·기기 측정',exact:true}).click();
 const panel=page.getByRole('region',{name:'얼굴 원본 변경 점검'});await panel.getByRole('button',{name:'얼굴 원본 점검',exact:true}).click();await expect(panel.getByRole('status')).toContainText('원본 점검 완료');await expect(panel).toContainText('원본 변경: 1장');await expect(page.getByRole('button',{name:'가족 1장',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('repeated recognition alternates real isolated Workers, cancels and keeps identity data untouched', async ({ page, isMobile }) => {
 test.skip(isMobile, 'Actual models exercised once; measurement controls are checked on both viewports.');
 test.setTimeout(240_000);
 await page.route('**/repeat-person.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
 await page.route('**/repeat-pet.jpg', route => route.fulfill({ path: 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
 await page.addInitScript(() => {
  const OriginalWorker = window.Worker;
  const state = { live: 0, peak: 0, mutations: 0, completed: 0 };
  window.addEventListener('gamjassak-person-diagnostics', () => state.completed++);
  window.addEventListener('gamjassak-pet-diagnostics', () => state.completed++);
  Object.defineProperty(window, '__repetitionState', { value: state });
  window.Worker = class extends OriginalWorker {
   private ended = false;
   constructor(url: string | URL, options?: WorkerOptions) { super(url, options); state.live++; state.peak = Math.max(state.peak, state.live); }
   terminate() { if (!this.ended) { this.ended = true; state.live--; } super.terminate(); }
  };
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: (path: string) => path.includes('pet') ? '/repeat-pet.jpg' : '/repeat-person.jpg', invoke: async (command: string) => {
   if (command === 'list_media') return [1, 2].map(id => ({ id, file_path: id === 1 ? 'person.jpg' : 'pet.jpg', file_type: 'image', taken_at: '2026-10-10', size_bytes: 1, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
   if (command === 'list_face_index') return { people: [], faces: [], scanned: [1, 2] };
   if (command === 'get_person_scan_source') return { source_key: 'sha256:unchanged', completed: true };
   if (command === 'person_runtime_environment') return { os: 'test-browser', architecture: 'x86_64', version: 'test' };
   if (command === 'person_evaluation_summary') return { references: 0, queries: 0 };
   if (/^(save_face_scan|save_pet_scan|enqueue_person_jobs|enqueue_pet_jobs|move_faces|rename_face_person)$/.test(command)) { state.mutations++; throw new Error('Benchmark must not save'); }
   return [];
  } } });
 });
 await page.goto('/');
 const external: string[] = [];
 await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click();
 await page.getByRole('button', { name: '얼굴 관리', exact: true }).click();
 await page.getByRole('button', { name: '인식 검증·기기 측정', exact: true }).click();
 const panel = page.getByRole('region', { name: '이 기기 인물 처리 속도' });
 await panel.getByLabel('인물 기기 측정 방식').selectOption('alternating');
 await panel.getByLabel('반려동물 전환 측정 사진').selectOption('2');
 // The development UI loads its own fonts. Observe inference only after the
 // selected measurement screen has finished loading those display resources.
 await page.evaluate(() => document.fonts.ready);
 page.on('request', request => { if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) external.push(request.url()); });
 await panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true }).click();
 await expect(panel.getByLabel('인물 기기 측정 방식')).toBeDisabled();
 await expect.poll(() => page.evaluate(() => (window as unknown as { __repetitionState: { completed: number } }).__repetitionState.completed), { timeout: 30_000 }).toBeGreaterThan(0);
 await panel.getByRole('button', { name: '인물 측정 중단', exact: true }).click();
 await expect(panel).toContainText('인물 측정을 중단했습니다.');
 await expect(panel).not.toContainText('반복 측정 완료');
 await panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true }).click();
 await expect(panel).toContainText('반복 측정 완료 · 40장 분석 · 인물·반려동물 전환 39회', { timeout: 180_000 });
 await expect(panel).toContainText('탐지 수 3~3');
 await expect(panel).toContainText('반려동물 20회 · wasm');
 await expect(panel).toContainText('텐서 수 300~300');
 await expect(panel).toContainText('텐서 수 399~399');
 const state = await page.evaluate(() => (window as unknown as { __repetitionState: { live: number; peak: number; mutations: number } }).__repetitionState);
 expect(state.peak).toBe(1); expect(state.mutations).toBe(0); expect(external).toEqual([]);
 await mkdir('preview-results', { recursive: true });
 await writeFile('preview-results/person-repetition-smoke.json', JSON.stringify({ environment: 'desktop Chromium, functional fixtures only', alternatingSummary: await panel.locator('div[role="status"]').innerText(), ...state, externalRequests: external.length, identityAccuracyMeasured: false, phonePerformanceMeasured: false }, null, 2));
 await panel.getByLabel('인물 기기 측정 방식').selectOption('people');
 await panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true }).click();
 await expect(panel).toContainText('반복 측정 완료 · 20장 분석 · 인물·반려동물 전환 0회', { timeout: 60_000 });
 await expect(panel).toContainText('텐서 수 300~300');
 await expect(page.getByRole('button', { name: '얼굴 관리', exact: true })).toBeEnabled();
});

test('repetition controls reject changed source and do not present a completed report', async ({ page }) => {
 await page.route('**/src/features/people/engine/repetitionBenchmark.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export async function measureRecognitionRepetition(url, pet, cycles, signal, progress) { signal.throwIfAborted(); progress(cycles); return {samples:[]}; }' }));
 await page.addInitScript(() => {
  let reads = 0;
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: () => '/favicon.svg', invoke: async (command: string) => {
   if (command === 'list_media') return [{ id: 1, file_path: 'photo.jpg', file_type: 'image', taken_at: '2026-10-10', size_bytes: 1, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }];
   if (command === 'list_face_index') return { people: [], faces: [], scanned: [1] };
   if (command === 'get_person_scan_source') return { source_key: ++reads === 1 ? 'sha256:before' : 'sha256:changed' };
   if (command === 'person_runtime_environment') return { os: 'test-browser', architecture: 'x86_64', version: 'test' };
   if (command === 'person_evaluation_summary') return { references: 0, queries: 0 };
   return [];
  } } });
 });
 await page.goto('/'); await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click(); await page.getByRole('button', { name: '얼굴 관리', exact: true }).click(); await page.getByRole('button', { name: '인식 검증·기기 측정', exact: true }).click();
 const panel = page.getByRole('region', { name: '이 기기 인물 처리 속도' });
 await panel.getByLabel('인물 기기 측정 방식').selectOption('alternating');
 await expect(panel.getByLabel('반려동물 전환 측정 사진')).toBeVisible();
 await panel.getByLabel('인물 반복 측정 횟수').selectOption('100');
 await panel.getByLabel('인물 기기 측정 방식').selectOption('people');
 await expect(panel.getByLabel('반려동물 전환 측정 사진')).toHaveCount(0);
 await panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true }).click();
 await expect(panel).toContainText('측정 중 사진이 변경됐습니다. 결과를 표시하지 않았습니다.');
 await expect(panel).not.toContainText('반복 측정 완료');
 await expect(panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true })).toBeEnabled();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
