import {test,expect} from '@playwright/test';
import {installOwnAi,requestedInputs,configureInference} from './fixtures/own-ai';

test('bundled settings fit 320px without downloads or typing and restore focus',async({page,isMobile})=>{
  await page.setViewportSize({width:320,height:700});await installOwnAi(page);await page.goto('/');
  const opener=page.getByRole('button',{name:'AI 반응 설정',exact:true});await opener.click();
  const dialog=page.getByRole('dialog',{name:'AI 반응 설정',exact:true});
  await expect(dialog).toContainText('앱에 포함');await expect(dialog).toContainText('인터넷 없이');
  await expect(dialog.locator('input,textarea,[role="progressbar"]')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/다운로드|AI 준비하기|더 자연스러운 AI/})).toHaveCount(0);
  await expect(dialog.getByRole('link',{name:'AI 모듈 안내'})).toHaveAttribute('href','/notices/companion-ai-NOTICE.txt');
  await dialog.getByText('최근 실행 시간 보기',{exact:true}).click();await expect(dialog).toContainText('모델 준비');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await dialog.screenshot({path:`preview-results/own-ai-settings-${test.info().project.name}.png`});
  if(isMobile)expect(await page.evaluate(()=>window.__gamjassakBack?.())).toBe(true);
  else await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
});

test('real bundled model produces short new lines for five actions without external requests',async({page})=>{
  const external:string[]=[];page.on('request',request=>{if(!['127.0.0.1','localhost'].includes(new URL(request.url()).hostname))external.push(request.url());});
  await installOwnAi(page,{affection:95});await page.goto('/');await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('button',{name:'함께하기',exact:true}).click();const bubble=page.locator('#homeMessage');
  for(const name of ['함께 산책','간식 주기','쓰다듬기','함께 놀기','함께 쉬기']){
    await page.getByRole('group',{name:'친구와 함께하기'}).getByRole('button',{name,exact:true}).click();
    await expect(bubble).toHaveAttribute('data-source','on-device');await expect(bubble).toBeVisible();
    const line=await bubble.innerText();expect(Array.from(line).length).toBeGreaterThan(1);expect(Array.from(line).length).toBeLessThanOrEqual(100);
    expect(line).not.toMatch(/<think>|<\|im_|AI가 대사|다시 터치/);
  }
  expect((await requestedInputs(page)).map((input:any)=>input.action)).toEqual(['walk','treat','pet','play','rest']);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 95');expect(external).toEqual([]);
});

test('Dorongi moves a janggi piece, follows three story chapters and speaks from the bundled model', async ({page}) => {
  await installOwnAi(page,{characterId:'apple',affection:44});
  await page.goto('/');
  const bubble=page.locator('#homeMessage');
  const expectVoice=async (meaning:RegExp)=>{
    await expect(bubble).toHaveAttribute('data-source','on-device');
    await expect(bubble).toContainText(meaning);
    await expect(bubble).toContainText(/소[.!?]|구려[.!?]|시게[.!?]|하오[.!?]|오[.!?]|십시다[.!?]/);
  };
  await page.getByRole('button',{name:'도롱이에게 말 걸기',exact:true}).click();
  await expectVoice(/부르|인사|이름|기억|곁|말씀|기척|소식|자리|기다|얼른|목소리|여기|놓이|오셨|마음|말할|궁금|와 주|듣|반갑|오시게|안부|발소리/);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 45');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  const scene=page.getByRole('region',{name:'함께하기 장면'});
  await page.getByRole('button',{name:'장기 두기',exact:true}).click();
  await expect(scene).toContainText('차를 옮길');
  expect(await requestedInputs(page)).toHaveLength(1);
  await page.getByRole('button',{name:'차를 두 칸 올리기'}).click();
  await expectVoice(/장기|차|말|한 수/);
  await expect(scene.locator('.homeJanggiBoard > :nth-child(2)')).toHaveAttribute('data-piece','chariot');
  await page.getByRole('button',{name:'첫사랑 얘기 듣기',exact:true}).click();
  await expectVoice(/개울|처음|첫 만남|그이/);
  await expect(scene).toContainText('개울가의 첫 만남');
  await scene.getByRole('button',{name:'이어서 듣기'}).click();
  await expectVoice(/편지|답장/);
  await expect(scene).toContainText('접어 둔 편지');
  await scene.getByRole('button',{name:'이어서 듣기'}).click();
  await expectVoice(/나루|작별|배웅|떠나|떠날|멀어|마지막 인사/);
  await expect(scene).toContainText('나루의 작별');
  for(const [label,meaning] of [['막걸리 따르기',/막걸리|잔|주전자|소반/],['갓 매만지기',/갓|매듭/],['붓글씨 쓰기',/붓|먹|획|글|종이/]] as const){
    await page.getByRole('button',{name:label,exact:true}).click();
    if(label==='막걸리 따르기'){
      await expect(scene.locator('.homePourTray')).toHaveAttribute('data-filled','false');
      await scene.getByRole('button',{name:'두 잔에 따르기'}).click();
      await expect(scene.locator('.homePourTray')).toHaveAttribute('data-filled','true');
    }
    await expectVoice(meaning);
  }
  await page.getByRole('button',{name:'지켜보기',exact:true}).click();
  await expect(bubble).toHaveAttribute('data-state','watching');
  expect((await requestedInputs(page)).map((input:{action:string})=>input.action)).toEqual([
    'touch','janggi','first-love-meeting','first-love-letter','first-love-farewell','pour-makgeolli','straighten-hat','write-calligraphy',
  ]);
});

test('Bosul fills and bakes one bread batch, and the batch survives reload', async ({page}) => {
  await installOwnAi(page,{characterId:'grape',affection:44});
  await page.goto('/');
  const open=()=>page.getByRole('button',{name:'함께하기',exact:true}).click();
  await open();
  await expect(page.getByRole('button',{name:/햇살/})).toHaveCount(0);
  await page.getByRole('button',{name:'구워주기',exact:true}).click();
  await expect(page.locator('#homeMessage')).toContainText('앙금부터');
  await page.getByRole('button',{name:'고구마 앙금 넣기',exact:true}).click();
  await expect(page.locator('[data-activity="fill-bread"]')).toContainText('반죽에 고구마 앙금');
  await page.reload();
  await open();
  await page.getByRole('button',{name:'구워주기',exact:true}).click();
  await expect(page.locator('[data-activity="bake-bread"]')).toContainText('소보로가 구워졌어요');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 44');
  expect(await requestedInputs(page)).toEqual([]);
});

test('silent Gomi completes a fresh saved interaction without inference below the threshold',async({page})=>{
  await installOwnAi(page,{affection:58});await page.goto('/');await page.locator('.homeMascot').click();
  const bubble=page.locator('#homeMessage');await expect(bubble).toHaveAttribute('data-state','quiet');
  await expect(bubble).toHaveAttribute('data-response-id',/^[1-9]\d*$/);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 59');expect(await requestedInputs(page)).toEqual([]);
  await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await page.screenshot({path:`preview-results/own-ai-quiet-${test.info().project.name}.png`});
});

test('a saved relationship reaching 60 enables speech using the saved value',async({page})=>{
  await installOwnAi(page,{affection:59,interactionDelay:150,worker:{}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  expect((await requestedInputs(page))[0].affection).toBe(60);await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 60');
});

test('a failed quiet save never completes an interaction and retry stays silent',async({page})=>{
  await installOwnAi(page,{affection:20,saveError:true,worker:{}});await page.goto('/');
  await page.locator('.homeMascot').click();const bubble=page.locator('#homeMessage');
  await expect(bubble).toHaveAttribute('data-state','failed');
  expect(Number(await bubble.getAttribute('data-response-id'))).toBe(0);
  expect(await requestedInputs(page)).toEqual([]);
  await page.evaluate(()=>(window as any).ownAiProbe.saveError=false);
  await page.locator('.homeMascot').click();await expect(bubble).toHaveAttribute('data-state','quiet');
  await expect(bubble).toHaveAttribute('data-response-id',/^[1-9]\d*$/);
  expect(await requestedInputs(page)).toEqual([]);await expect(page.locator('.homeSpeech')).toHaveCount(0);
});

test('failed relationship storage starts no inference and retry saves before speaking',async({page})=>{
  await installOwnAi(page,{saveError:true,worker:{}});await page.goto('/');await page.locator('.homeMascot').click();
  const bubble=page.locator('#homeMessage');await expect(bubble).toHaveAttribute('data-state','failed');
  await expect(bubble).toContainText('친밀도를 저장하지 못했어요');await expect(page.locator('.homeSpeech')).toHaveCount(0);
  expect(await requestedInputs(page)).toEqual([]);await page.evaluate(()=>(window as any).ownAiProbe.saveError=false);
  await page.locator('.homeMascot').click();await expect(bubble).toHaveAttribute('data-source','on-device');
  expect((await requestedInputs(page))[0].affection).toBe(76);
});

test('inference failure is an error rather than speech and successful retry clears it',async({page})=>{
  await installOwnAi(page,{worker:{error:'AI_OWN_NO_VALID_LINE'}});await page.goto('/');await page.locator('.homeMascot').click();
  const bubble=page.locator('#homeMessage');await expect(bubble).toHaveAttribute('data-state','failed');
  await expect(bubble).toContainText('행동에 맞는 대사를 만들지 못했어요');await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await configureInference(page,{error:null});await page.locator('.homeMascot').click();
  await expect(bubble).toHaveAttribute('data-source','on-device');await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('AI가 새로운 대사를 만들었어요');
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

for (const width of [320, 360, 393]) {
  test(`retry generates the same snack response without repeating care at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:780});
    await installOwnAi(page, {affection:95, worker:{error:'AI_OWN_NO_VALID_LINE'}});
    await page.goto('/');
    await page.getByRole('button', {name:'함께하기', exact:true}).click();
    await page.getByRole('button', {name:'간식 주기', exact:true}).click();
    const retry = page.getByRole('button', {name:'대사 다시 생성', exact:true});
    await expect(retry).toBeVisible();
    const memory = () => page.evaluate(() => localStorage.getItem('gamjassak:companion:v1:gomi'));
    const saved = await memory();
    expect(saved).toBeTruthy();
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.homeDialogueSlot').screenshot({path:`preview-results/own-ai-retry-${width}-${test.info().project.name}.png`});
    await configureInference(page, {error:null});
    await retry.click();
    await expect(page.locator('#homeMessage')).toHaveText('gomi treat 새 반응 2');
    await expect(retry).toHaveCount(0);
    const requests = await requestedInputs(page);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(await memory()).toBe(saved);
    expect(await page.evaluate(() => (window as any).ownAiProbe.saveStarted)).toBe(0);
    await page.reload();
    expect(await memory()).toBe(saved);
    await expect(retry).toHaveCount(0);
  });
}

test('corrupt bundled asset is rejected and retry reloads a valid asset',async({page})=>{
  let broken=true;await page.route('**/character-ai/manifest.json',route=>broken?route.fulfill({contentType:'application/json',body:'{"id":"unverified"}'}):route.continue());
  await installOwnAi(page);await page.goto('/');await page.locator('.homeMascot').click();const bubble=page.locator('#homeMessage');
  await expect(bubble).toHaveAttribute('data-state','failed');await expect(bubble).toContainText('앱에 포함된 AI를 준비하지 못했어요');
  await expect(page.locator('.homeSpeech')).toHaveCount(0);broken=false;await page.locator('.homeMascot').click();
  await expect(bubble).toHaveAttribute('data-source','on-device');
});

test('settings during generation preserve pending reply and restore the opener',async({page})=>{
  await installOwnAi(page,{worker:{controlled:true}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);
  const opener=page.getByRole('button',{name:'AI 반응 설정',exact:true});await opener.click();
  await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await page.evaluate(()=>(window as any).ownAiProbe.worker.postMessage({finish:true}));
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await page.keyboard.press('Escape');await expect(opener).toBeFocused();await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 1');
});

test('leaving Home discards a late reply and next interaction gets its own answer',async({page})=>{
  await installOwnAi(page,{worker:{controlled:true}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.evaluate(()=>(window as any).ownAiProbe.worker.postMessage({finish:true}));
  await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await configureInference(page,{controlled:false});await page.locator('.homeMascot').click();
  await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 2');
});

test('an old reply stays hidden while a new sleep disturbance is saving',async({page})=>{
  await installOwnAi(page,{affection:95,sleeping:true,worker:{controlled:true}});await page.goto('/');
  await page.locator('.homeMascot').click();await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);
  await page.evaluate(()=>(window as any).ownAiProbe.holdSaves=true);
  await page.locator('.homeMascot').click();await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).ownAiProbe.pendingSaves.length)).toBe(1);
  await page.evaluate(()=>(window as any).ownAiProbe.worker.postMessage({finish:true}));
  // Observe the old result reaching the client, not an arbitrary sleep.
  await expect.poll(()=>page.evaluate(()=>(window as any).ownAiProbe.responses.filter((row:any)=>row.type==='reply').length)).toBe(1);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('.homeSpeech')).toHaveCount(0);
  expect((await requestedInputs(page)).length).toBe(1);
  await configureInference(page,{controlled:false});
  await page.evaluate(()=>(window as any).ownAiProbe.pendingSaves.shift()());
  await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 2');
  const input=(await requestedInputs(page)).at(-1);expect(input.affection).toBe(94);expect(input.mood).toBe('irritated');
});

test('backgrounding during relationship storage invalidates the pending reaction',async({page})=>{
  await installOwnAi(page,{holdSaves:true,worker:{}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).ownAiProbe.pendingSaves.length)).toBe(1);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
    (window as any).ownAiProbe.pendingSaves.shift()();
  });
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 76');
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','idle');
  await expect(page.locator('.homeSpeech')).toHaveCount(0);expect(await requestedInputs(page)).toEqual([]);
  await page.evaluate(()=>(window as any).ownAiProbe.holdSaves=false);
  await page.locator('.homeMascot').click();await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 1');
});

test('switching representative character drops previous pending speech',async({page})=>{
  await installOwnAi(page,{worker:{controlled:true}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);await page.getByRole('button',{name:'친구들 보기',exact:true}).click();
  await page.locator('.characterCard').filter({has:page.getByRole('heading',{name:'알토',exact:true})}).getByRole('button',{name:'대표로 설정'}).click();
  await page.evaluate(()=>(window as any).ownAiProbe.worker.postMessage({finish:true}));
  await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await configureInference(page,{controlled:false});await page.locator('.homeMascot').click();
  await expect(page.locator('#homeMessage')).toHaveText('potato touch 새 반응 2');
  expect((await requestedInputs(page)).map((input:any)=>input.characterId)).toEqual(['gomi','potato']);
});

test('sleep disturbance is bounded and snack keeps sleep context without penalty',async({page})=>{
  await installOwnAi(page,{affection:95,sleeping:true,worker:{}});await page.goto('/');const bubble=page.locator('#homeMessage');
  for(let index=0;index<6;index++){await page.locator('.homeMascot').click();await expect(bubble).toHaveText(`gomi touch 새 반응 ${index+1}`);}
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 92');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();await page.getByRole('button',{name:'간식 주기',exact:true}).click();
  await expect(bubble).toHaveText('gomi treat 새 반응 7');const input=(await requestedInputs(page)).at(-1);
  expect(input.sleeping).toBe(true);expect(input.action).toBe('treat');await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 92');
});
