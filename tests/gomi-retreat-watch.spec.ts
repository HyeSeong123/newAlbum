import {expect,test,type Page} from '@playwright/test';
import {installOwnAi,requestedInputs,configureInference} from './fixtures/own-ai';

const watchButton=(page:Page)=>page.getByRole('button',{name:'지켜보기',exact:true});
async function openActions(page:Page){await page.getByRole('button',{name:'함께하기',exact:true}).click();}
async function geometry(page:Page){
  const target=(await page.locator('.homeMascot').boundingBox())!;
  const body=(await page.locator('.homeMascot .gomiBody').boundingBox())!;
  return {width:body.width,x:body.x+body.width/2-target.x-target.width/2,top:body.y-target.y,targetWidth:target.width,targetHeight:target.height};
}

test('early Gomi shows only dots and takes centered backward steps while the touch target stays usable',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await installOwnAi(page,{affection:20});await page.goto('/');
  await page.locator('.homeMascot img').evaluate((image:HTMLImageElement)=>image.decode());
  await expect(page.locator('.homeQuietDots')).toHaveText('...');await expect(page.locator('.homeQuietDots')).toBeVisible();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','nonverbal');
  const start=await geometry(page);
  await page.locator('.homeWelcome').screenshot({path:`preview-results/own-ai-retreat-before-${test.info().project.name}.png`});
  for(const scale of [.88,.76,.64,.52,.52]){
    await page.locator('.homeMascot').click();await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','quiet');
    await expect.poll(async()=>(await geometry(page)).width).toBeCloseTo(start.width*scale,0);
    const current=await geometry(page);
    expect(Math.abs(current.x)).toBeLessThan(1);
    expect(current.top).toBeGreaterThan(start.top); // The top recedes toward the anchored feet as the drawing shrinks.
    expect(current.targetWidth).toBe(start.targetWidth);expect(current.targetHeight).toBe(start.targetHeight);
  }
  expect(await requestedInputs(page)).toEqual([]);
  await expect(page.locator('.homeQuietDots')).toHaveText('...');
  await page.locator('.homeWelcome').screenshot({path:`preview-results/own-ai-retreat-after-${test.info().project.name}.png`});
});

test('reduced motion retains a smaller centered pose without intermediate movement',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await installOwnAi(page,{affection:20});await page.goto('/');
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-reduced-motion','true');
  const start=await geometry(page);await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await geometry(page)).width).toBeCloseTo(start.width*.88,0);
  const endpoint=await geometry(page);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect((await geometry(page)).width).toBeCloseTo(endpoint.width,3);
  expect(Math.abs(endpoint.x)).toBeLessThan(1);expect(await requestedInputs(page)).toEqual([]);
});

test('rapid repeated touches continue the retreat without a jump to an unfinished target',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await installOwnAi(page,{affection:20});await page.goto('/');
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion','avoid');
  const samples=await page.evaluate(async()=>{
    const button=document.querySelector<HTMLButtonElement>('.homeMascot')!;
    const body=button.querySelector<HTMLElement>('.gomiBody')!;
    const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const full=button.getBoundingClientRect().width;
    button.click();await frame();await frame();
    const before=body.getBoundingClientRect().width;
    button.click();await frame();await frame();
    return {before,after:body.getBoundingClientRect().width,full};
  });
  expect(samples.after).toBeGreaterThan(samples.before-samples.full*.05);
  await expect.poll(async()=>(await geometry(page)).width).toBeCloseTo(samples.full*.76,0);
  expect(await requestedInputs(page)).toEqual([]);
});

for(const affection of [20,75])test(`watching sleeping Gomi at affection ${affection} preserves sleep, energy and relationship`,async({page})=>{
  await page.setViewportSize({width:320,height:852});
  await installOwnAi(page,{affection,sleeping:true});await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');await expect(visual).toHaveAttribute('data-motion','sleep-curled');
  const before=await page.evaluate(()=>localStorage.getItem('gamjassak:companion:v1:gomi'));
  await openActions(page);const actions=page.getByRole('group',{name:'친구와 함께하기'});
  await expect(actions.getByRole('button')).toHaveCount(6);
  await watchButton(page).scrollIntoViewIfNeeded();await expect(watchButton(page)).toBeInViewport();
  expect((await watchButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await actions.screenshot({path:`preview-results/own-ai-watch-actions-${affection}-${test.info().project.name}.png`});
  for(let index=0;index<3;index++){
    await watchButton(page).click();await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','watching');
    await expect(page.locator('#homeMessage')).toContainText('조용히 지켜보고');
    await expect(visual).toHaveAttribute('data-motion','sleep-curled');
  }
  if(affection<60)await expect(page.locator('.homeQuietDots')).toBeVisible();
  await expect(page.locator('.homeCharacterMeta')).toContainText(`친밀도 ${affection}`);
  expect(await requestedInputs(page)).toEqual([]);
  expect(await page.evaluate(()=>(window as any).ownAiProbe.saveStarted)).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('gamjassak:companion:v1:gomi'))).toBe(before);
});

test('watching cancels a pending generated line and talking again still works',async({page})=>{
  await installOwnAi(page,{worker:{controlled:true}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(async()=>(await requestedInputs(page)).length).toBe(1);
  await openActions(page);await watchButton(page).click();
  await page.evaluate(()=>(window as any).ownAiProbe.worker.postMessage({finish:true}));
  await expect.poll(()=>page.evaluate(()=>(window as any).ownAiProbe.responses.filter((row:any)=>row.type==='reply').length)).toBe(1);
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','watching');
  await expect(page.locator('.homeSpeech')).toHaveCount(0);
  await configureInference(page,{controlled:false});await page.locator('.homeMascot').click();
  await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 2');
});

test('watching while a relationship is saving prevents delayed speech across the 59 to 60 boundary',async({page})=>{
  await installOwnAi(page,{affection:59,holdSaves:true,worker:{}});await page.goto('/');await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).ownAiProbe.pendingSaves.length)).toBe(1);
  await openActions(page);await watchButton(page).click();
  await page.evaluate(()=>(window as any).ownAiProbe.pendingSaves.shift()());
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 60');
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','watching');
  await expect(page.locator('.homeSpeech')).toHaveCount(0);expect(await requestedInputs(page)).toEqual([]);
  await page.evaluate(()=>(window as any).ownAiProbe.holdSaves=false);
  await page.locator('.homeMascot').click();await expect(page.locator('#homeMessage')).toHaveText('gomi touch 새 반응 1');
});

test('watching another representative retains its posture and does not create a model request or activity',async({page})=>{
  await installOwnAi(page,{characterId:'potato',worker:{}});await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');const posture=await visual.getAttribute('data-motion');
  await openActions(page);await watchButton(page).click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-state','watching');
  await expect(visual).toHaveAttribute('data-motion',posture!);
  expect(await requestedInputs(page)).toEqual([]);expect(await page.evaluate(()=>(window as any).ownAiProbe.saveStarted)).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('gamjassak:companion:v1:potato'))).toBeNull();
});
