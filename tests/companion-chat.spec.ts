import {test,expect} from '@playwright/test';

async function installAi(page:any, options:{ready?:boolean;delay?:number;gomi?:boolean}={}) {
  await page.addInitScript((settings:any)=>{
    Math.random=()=>settings.gomi?.55:.1;
    let downloading=false, interacted=false, calls=0;
    const owned={id:settings.gomi?'gomi':'potato',customName:null,growthStage:6,affection:0,isMain:true};
    const state=(window as any).touchProbe={prompts:[] as string[],stops:0};
    (window as any).__TAURI_INTERNALS__={convertFileSrc:()=>'/favicon.png',invoke:async(command:string,args:any={})=>{
      if(command==='sync_characters'||command==='interact_character'){
        if(command==='interact_character'&&!interacted){owned.affection++;interacted=true;}
        return {characters:[{...owned}],events:[]};
      }
      if(command==='chat_model_status')return {phase:settings.ready===false?(downloading?'downloading':'missing'):'ready',installed:settings.ready!==false,supported:true,total:100,downloaded:downloading?42:0,message:'AI를 한 번 준비해 주세요.'};
      if(command==='download_chat_model')downloading=true;
      if(command==='stop_chat_model'){downloading=false;state.stops++;}
      if(command==='generate_chat_reply'){
        state.prompts.push(args.prompt);const call=++calls;
        if(settings.delay)await new Promise(resolve=>setTimeout(resolve,settings.delay));
        return settings.gomi?'…조용히 해. 나 아직 졸려.':call===1?'오늘은 네 손길이 반가워! 같이 놀아 볼까?':'오늘은 네 옆에서 느긋하게 쉬고 싶어.';
      }
      return [];
    }};
  },options);
}

test('AI setup explains touch reactions without any typing UI and Back restores focus',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:'대화하기',exact:true})).toHaveCount(0);
  const open=page.getByRole('button',{name:'AI 반응 설정',exact:true});await open.click();
  const dialog=page.getByRole('dialog',{name:'AI 반응 설정',exact:true});
  await expect(dialog).toContainText('캐릭터를 터치하면');
  await expect(dialog.locator('input,textarea')).toHaveCount(0);
  await expect(dialog).toContainText('RAM 8GB 이상 Android 스마트폰');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
});

test('touch and shared activities generate new AI lines using mood without user input',async({page})=>{
  await installAi(page);await page.goto('/');
  await expect(page.locator('.homeCharacterMeta')).toContainText('감자싹');
  expect(await page.evaluate(()=>(window as any).touchProbe.prompts)).toHaveLength(0);
  await page.getByRole('button',{name:'감자싹에게 말 걸기'}).click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await expect(page.locator('#homeMessage')).toContainText('네 손길이 반가워');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  await page.getByRole('button',{name:'함께 쉬기',exact:true}).click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  const prompts=await page.evaluate(()=>(window as any).touchProbe.prompts);
  expect(prompts).toHaveLength(2);expect(prompts[1]).toContain('나른함');expect(prompts[1]).toContain('네 손길이 반가워');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gamjassak:reaction-lines:v1:potato')!))).toHaveLength(2);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'preview-results/companion-touch-ai-home.png',fullPage:true});
});

test('leaving Home during generation cancels it and never shows its old answer on return',async({page})=>{
  await installAi(page,{delay:1400});await page.goto('/');
  await page.getByRole('button',{name:'감자싹에게 말 걸기'}).click();
  await expect(page.getByRole('button',{name:'AI 반응 멈추기'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.stops)).toBeGreaterThan(0);
  await page.waitForTimeout(1600);
  await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','local-rules');
  await expect(page.locator('#homeMessage')).not.toContainText('네 손길이 반가워');
});

test('sleeping Gomi uses sleepy touch context and keeps her resting motions',async({page})=>{
  await installAi(page,{gomi:true});await page.goto('/');
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  await mascot.click();await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await expect(page.locator('#homeMessage')).toContainText('나 아직 졸려');
  const prompt=await page.evaluate(()=>(window as any).touchProbe.prompts[0]);
  expect(prompt).toContain('나른함');expect(prompt).toContain('친밀도: 0');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-motion',/^sleep-/);
});

test('model preparation is explicit, cancellable and fits a 320px phone',async({page})=>{
  await page.setViewportSize({width:320,height:700});await installAi(page,{ready:false});
  await page.goto('/');await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await page.getByRole('button',{name:'AI 준비하기',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','42');
  await page.getByRole('button',{name:'다운로드 취소'}).click();
  await expect(page.getByRole('button',{name:'AI 준비하기',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByRole('dialog').locator('input,textarea')).toHaveCount(0);
  await page.screenshot({path:'preview-results/companion-touch-ai-setup-320.png'});
});
