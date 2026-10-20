import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function prepare(page: import('@playwright/test').Page) {
  const thumbnail = `data:image/jpeg;base64,${(await readFile('tests/fixtures/pet-dog.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail }) => {
    const pets: {id: number; name: string; cover_media_id: number | null; media_ids: number[]}[] = [{ id: 1, name: '보리', cover_media_id: 1, media_ids: [1] }, { id: 2, name: '초코', cover_media_id: null, media_ids: [] }];
    const vector = (n: number) => Array(n).fill(0).map((_, i) => Number(i === 0));
    const base = { kind: 'dog', view: 'unknown', viewSource: 'unknown', box: [.05, .1, .4, .8], detectionScore: .9, appearance: vector(1024), mirroredAppearance: vector(1024), color: vector(120), shape: vector(10) };
    const detections = [{ ...base, id: 1, media_id: 1, pet_id: 1 as number | null, excluded: false }, { ...base, id: 2, media_id: 2, pet_id: null as number | null, excluded: false }, { ...base, id: 3, media_id: 2, pet_id: null as number | null, excluded: false, box: [.55, .1, .4, .8] }];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: () => thumbnail, invoke: async (command: string, args: any) => {
      if (command === 'list_media') return [1, 2].map(id => ({ id, file_path: `C:/pet/${id}.jpg`, file_type: 'image', taken_at: '2026-10-09', size_bytes: 1000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
      if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
      if (command === 'list_pet_jobs') return { pending: 0, paused: 0, failed: 0, jobs: [] };
      if (command === 'media_thumbnail') return 'C:/thumb.jpg';
      if (command === 'list_pets') return structuredClone(pets);
      if (command === 'get_pet_scan') return { media_id: args.mediaId, engine_version: 'gamjassak-pets-v3-no-pose', source_key: 'mock', detections: detections.filter(d => d.media_id === args.mediaId) };
      if (command === 'list_pet_detections') return detections.filter(d => (args.mediaId === null || d.media_id === args.mediaId) && d.id > args.afterId && (!args.references || d.pet_id !== null && !d.excluded)).slice(0, args.limit);
      if (command === 'enqueue_pet_jobs') { const calls = JSON.parse(localStorage.getItem('pet-search-jobs') ?? '[]'); calls.push(args.jobs); localStorage.setItem('pet-search-jobs', JSON.stringify(calls)); return; }
      if (command === 'confirm_pet_detection') {
        if (localStorage.getItem('fail-connect')) throw new Error('연결 실패 · 다시 시도해 주세요.');
        const row = detections.find(d => d.id === args.detectionId)!; row.pet_id = args.petId; row.view = args.view; row.excluded = args.excluded;
        if (row.view === 'rear') { row.appearance = []; row.mirroredAppearance = []; }
        const owner = pets.find(p => p.id === args.petId); if (owner && !owner.media_ids.includes(row.media_id)) owner.media_ids.push(row.media_id);
        localStorage.setItem('pet-confirmed-test', JSON.stringify(detections)); return;
      }
      return [];
    } } });
  }, { thumbnail });
  await page.goto('/'); await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click(); await page.getByRole('tab', { name: '반려동물', exact: true }).click();
}

test('registered photos can be searched and each animal connected without diagnostic controls', async ({ page }) => {
  await prepare(page);
  await expect(page.getByRole('button', { name: '반려동물 인식 결과 확인', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '보리 1장', exact: true }).click();
  await page.getByRole('button', { name: '반려동물 관리', exact: true }).click();
  await expect(page.getByRole('button', { name: '인식 기준·결과 확인', exact: true })).toHaveCount(0); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '등록된 사진에서 찾기', exact: true }).click();
  const search = page.getByRole('dialog', { name: '등록된 사진에서 찾기' });
  await expect(search.locator('.petSearchCard')).toHaveCount(2);
  await expect.poll(() => search.locator('.petDetectionPreview').first().evaluate(element => { const bounds = element.getBoundingClientRect(); return Math.round(bounds.width / bounds.height * 100); })).toBe(133);
  await expect(search.getByRole('button', { name: '검증 자료 만들기', exact: true })).toHaveCount(0);
  await search.getByRole('button', { name: '사진 찾기 시작', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pet-search-jobs') ?? '[]'))).toEqual([
    [{ mediaId: 1, petId: 1, view: 'unknown' }],
    [{ mediaId: 1, petId: null, view: 'unknown' }, { mediaId: 2, petId: null, view: 'unknown' }],
  ]);
  await expect(search.locator('.entityEditFooter')).toBeInViewport();
  await page.screenshot({ path: `preview-results/pet-review-${test.info().project.name}.png` });
  await search.getByRole('button', { name: '보리 사진 선택 2', exact: true }).click();
  await search.getByRole('button', { name: /선택한 사진 연결/ }).click();
  await expect(search.locator('.petSearchCard')).toHaveCount(0); // the photo is already linked, including its other animal
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pet-confirmed-test')!)[2].pet_id)).toBeNull();
  await search.locator('.entityEditFooter').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '사진 상세보기', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '반려동물 목록', exact: true }).click();
  await page.getByRole('button', { name: '초코 0장', exact: true }).click();
  await page.getByRole('button', { name: '등록된 사진에서 찾기', exact: true }).click();
  await expect(search.getByRole('button', { name: '사진 찾기 시작', exact: true })).toBeDisabled();
  await expect(search.getByText(/먼저 이름·사진 수정에서/)).toBeVisible();
});

test('failed photo connection retains candidates and can be retried', async ({ page }) => {
  await prepare(page); await page.getByRole('button', { name: '등록된 사진에서 찾기', exact: true }).click();
  const search = page.getByRole('dialog', { name: '등록된 사진에서 찾기' });
  await page.evaluate(() => localStorage.setItem('fail-connect', 'true'));
  await search.getByRole('button', { name: '보리 사진 선택 2', exact: true }).click();
  await search.getByRole('button', { name: /선택한 사진 연결/ }).click();
  await expect(search.getByRole('alert')).toContainText('연결 실패'); await expect(search.locator('.petSearchCard')).toHaveCount(2);
  await page.evaluate(() => localStorage.removeItem('fail-connect'));
  await search.getByRole('button', { name: /선택한 사진 연결/ }).click(); await expect(search.locator('.petSearchCard')).toHaveCount(0);
  await search.getByTitle('닫기').click(); await page.getByRole('tab', { name: '사람', exact: true }).click();
  await expect(page.getByRole('button', { name: '사진에서 사람 찾기', exact: true }).first()).toBeVisible();
});

test('cached library search batches the queue and reuses existing scans', async ({ page }) => {
  await page.addInitScript(() => {
    const media = Array.from({ length: 121 }, (_, index) => ({ id: index + 1, file_path: `C:/pets/${index + 1}.jpg`, file_type: 'image', size_bytes: 100, metadata_status: 'ready', favorite: false, rating: 0, comment: '' }));
    let jobs: { id: number; media_id: number; pet_id: number | null; view: string; state: string; error: string }[] = [];
    let next = 1, queueReads = 0, scans = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: () => '/favicon.png', invoke: async (command: string, args: any) => {
      if (command === 'list_media') return media;
      if (command === 'list_face_index') return { people: [], faces: [], scanned: [] };
      if (command === 'list_pets') return [{ id: 1, name: '보리', cover_media_id: 1, media_ids: [1] }];
      if (command === 'list_pet_detections') return [];
      if (command === 'list_pet_jobs') { queueReads++; return { jobs: jobs.slice(0, 100), pending: jobs.length, paused: 0, failed: 0 }; }
      if (command === 'enqueue_pet_jobs') { jobs.push(...args.jobs.map((job: any) => ({ id: next++, media_id: job.mediaId, pet_id: job.petId, view: job.view, state: 'pending', error: '' }))); return; }
      if (command === 'prepare_pet_input') return { path: 'cached.jpg', sourceKey: 'cached-source' };
      if (command === 'get_pet_scan') { scans++; return { engine_version: 'gamjassak-pets-v3-no-pose', source_key: 'cached-source', media_id: args.mediaId, detections: [] }; }
      if (command === 'finish_pet_job') { jobs = jobs.filter(job => job.id !== args.id); localStorage.setItem('pet-queue-test', JSON.stringify({ queueReads, scans, remaining: jobs.length })); return; }
      return [];
    } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '사람과 반려동물', exact: true }).click(); await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  await page.getByRole('button', { name: '등록된 사진에서 찾기', exact: true }).click();
  await page.getByRole('button', { name: '사진 찾기 시작', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pet-queue-test') ?? '{}').scans)).toBe(122);
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('pet-queue-test')!));
  expect(result.remaining).toBe(0); expect(result.queueReads).toBeLessThan(10);
  await expect(page.getByRole('dialog', { name: '등록된 사진에서 찾기' }).getByRole('button', { name: '사진 찾기 시작', exact: true })).toBeEnabled();
});

async function prepareLargeLibrary(page: import('@playwright/test').Page, pending = false) {
  const thumbnail = `data:image/jpeg;base64,${(await readFile('tests/fixtures/pet-dog.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail, pending }) => {
    const media = Array.from({length:100},(_,i)=>({id:i+1,file_path:`C:/pets/${i+1}.jpg`,file_type:'image',size_bytes:100,metadata_status:'ready',favorite:false,rating:0,comment:''}));
    const pets=[{id:1,name:'보리',media_ids:[1],cover_media_id:1}];
    const vector=(n:number)=>Array.from({length:n},(_,i)=>Number(i===0));
    const base={kind:'dog',view:'unknown',viewSource:'unknown',box:[.1,.1,.8,.8],detectionScore:.9,appearance:vector(1024),mirroredAppearance:vector(1024),color:vector(120),shape:vector(10),excluded:false};
    const detections=Array.from({length:28},(_,i)=>({...base,id:i+1,media_id:i+1,pet_id:i===0?1:null as number|null}));
    const record=(command:string,args:any)=>{const calls=JSON.parse(localStorage.getItem('native-calls')??'[]');calls.push({command,args});localStorage.setItem('native-calls',JSON.stringify(calls));};
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:()=>thumbnail,invoke:async(command:string,args:any={})=>{
      record(command,args);
      if(command==='list_media')return media;
      if(command==='list_face_index')return {people:[],faces:[],scanned:[]};
      if(command==='list_pet_jobs')return {pending:Number(pending),paused:0,failed:0,jobs:pending?[{id:1,media_id:2,pet_id:null,view:'unknown',state:'pending',error:''}]:[]};
      if(command==='list_pets')return structuredClone(pets);
      if(command==='save_pet'){const id=args.id??pets.length+1;const owner=pets.find(row=>row.id===id);if(owner)Object.assign(owner,{name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId});else pets.push({id,name:args.name,media_ids:args.mediaIds,cover_media_id:args.coverMediaId});return id;}
      if(command==='list_pet_detections')return detections.filter(d=>d.id>args.afterId&&(!args.references||d.pet_id!==null)).slice(0,args.limit);
      if(command==='confirm_pet_detection'){
        if(args.detectionId===28&&localStorage.getItem('fail-last'))throw '마지막 사진 연결 실패';
        const row=detections.find(d=>d.id===args.detectionId)!;row.pet_id=args.petId;
        const owner=pets.find(p=>p.id===args.petId)!;if(!owner.media_ids.includes(row.media_id))owner.media_ids.push(row.media_id);return;
      }
      return [];
    }}});
  },{thumbnail,pending});
  await page.goto('/');
}

test('100 imported photos and profile saves stay idle until an explicit request',async({page})=>{
  await prepareLargeLibrary(page);
  await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();
  await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('gamjassak-pet-import',{detail:Array.from({length:100},(_,i)=>({id:String(i+1),fileType:'image'}))}));});
  await page.getByRole('button',{name:'반려동물 등록',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'반려동물 등록',exact:true});
  await editor.getByLabel('이름',{exact:true}).fill('고미');await editor.getByRole('button',{name:'사진 선택',exact:true}).first().click();await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor).toBeHidden();
  await page.getByRole('button',{name:'이름·사진 수정',exact:true}).click();await page.getByRole('dialog',{name:'반려동물 편집',exact:true}).getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const calls=await page.evaluate(()=>JSON.parse(localStorage.getItem('native-calls')!));
  expect(calls.filter((row:any)=>['enqueue_pet_jobs','prepare_pet_input','control_pet_jobs'].includes(row.command))).toEqual([]);
  await expect(page.locator('.petsView').getByRole('button',{name:'사진 직접 등록',exact:true})).toHaveCount(0);
  await expect(page.locator('.petsView').getByRole('button',{name:'등록 사진 다시 분석',exact:true})).toHaveCount(0);
});

test('pending work remains idle after restart and confirmation opens the real result picker',async({page})=>{
  await prepareLargeLibrary(page,true);await expect(page.getByRole('button',{name:'반려동물 확인',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'반려동물 확인',exact:true}).click();
  await expect(page.getByRole('tab',{name:'반려동물',exact:true})).toHaveAttribute('aria-selected','true');
  const search=page.getByRole('dialog',{name:'등록된 사진에서 찾기',exact:true});await expect(search).toBeVisible();await expect(search.locator('.petSearchCard')).toHaveCount(24);
  const calls=await page.evaluate(()=>JSON.parse(localStorage.getItem('native-calls')!));expect(calls.some((row:any)=>row.command==='prepare_pet_input')).toBe(false);
  await search.locator('.entityEditFooter').getByRole('button',{name:'닫기',exact:true}).click();await expect(page.getByRole('button',{name:'반려동물 확인',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'반려동물 확인',exact:true}).click();await expect(search).toBeVisible();
});

test('multi-selection crosses result pages and keeps only failed selections for retry',async({page})=>{
  await prepareLargeLibrary(page);await page.getByRole('button',{name:'사람과 반려동물',exact:true}).click();await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'등록된 사진에서 찾기',exact:true}).click();
  const search=page.getByRole('dialog',{name:'등록된 사진에서 찾기',exact:true});await expect(search.locator('.petSearchCard')).toHaveCount(24);
  await search.getByRole('button',{name:'보리 사진 선택 2',exact:true}).click();await search.getByRole('button',{name:'보리 사진 선택 3',exact:true}).click();await search.getByTitle('다음 사진').click();
  await expect(search.locator('.petSearchCard')).toHaveCount(3);await search.getByRole('button',{name:'보리 사진 선택 28',exact:true}).click();
  await expect(search.getByRole('button',{name:'선택한 사진 연결 (3)',exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('fail-last','1'));await search.getByRole('button',{name:'선택한 사진 연결 (3)',exact:true}).click();
  await expect(search.getByRole('alert')).toContainText('마지막 사진 연결 실패');await expect(search.getByRole('button',{name:'선택한 사진 연결 (1)',exact:true})).toBeEnabled();await expect(search.getByRole('button',{name:'보리 사진 선택 28',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>localStorage.removeItem('fail-last'));await search.getByRole('button',{name:'선택한 사진 연결 (1)',exact:true}).click();await expect(search.getByRole('button',{name:'선택한 사진 연결',exact:true})).toBeDisabled();
  const calls=await page.evaluate(()=>JSON.parse(localStorage.getItem('native-calls')!).filter((row:any)=>row.command==='confirm_pet_detection').map((row:any)=>row.args.detectionId));expect(calls).toEqual([2,3,28,28]);
});
