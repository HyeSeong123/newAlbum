import {test,expect} from '@playwright/test';
import {installOwnAi,requestedInputs,configureInference} from './fixtures/own-ai';

test('bundled settings fit 320px without downloads or typing and restore focus',async({page})=>{
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
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
});

test('real bundled model produces short new lines for five actions without external requests',async({page})=>{
  await installOwnAi(page,{affection:95});await page.goto('/');await page.evaluate(()=>document.fonts.ready);
  const external:string[]=[];page.on('request',request=>{if(!['127.0.0.1','localhost'].includes(new URL(request.url()).hostname))external.push(request.url());});
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
  await expect(bubble).toContainText('다시 터치');await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await configureInference(page,{error:null});await page.locator('.homeMascot').click();
  await expect(bubble).toHaveAttribute('data-source','on-device');await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('AI가 새로운 대사를 만들었어요');
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

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

test('switching representative character drops previous pending speech',async({page})=>{
  await installOwnAi(page,{worker:{controlled:true}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);await page.getByRole('button',{name:'친구들 보기',exact:true}).click();
  await page.locator('.characterCard').filter({has:page.getByRole('heading',{name:'감자싹',exact:true})}).getByRole('button',{name:'대표로 설정'}).click();
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
