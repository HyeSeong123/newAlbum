import {test,expect} from '@playwright/test';

async function installAi(page:any, options:{ready?:boolean;delay?:number;gomi?:boolean;affection?:number;statusDelay?:number;interactionDelay?:number}={}) {
  await page.addInitScript((settings:any)=>{
    Math.random=()=>settings.gomi?.55:.1;
    let downloading=false, interacted=false, calls=0, disturbances=0;
    const owned={id:settings.gomi?'gomi':'potato',customName:null,growthStage:6,affection:settings.affection||0,isMain:true};
    const state=(window as any).touchProbe={prompts:[] as string[],stops:0};
    (window as any).__TAURI_INTERNALS__={convertFileSrc:()=>'/favicon.png',invoke:async(command:string,args:any={})=>{
      if(command==='sync_characters'||command==='interact_character'){
        if(command==='interact_character'&&settings.interactionDelay)await new Promise(resolve=>setTimeout(resolve,settings.interactionDelay));
        if(command==='interact_character'&&args.source==='home'&&!interacted){owned.affection++;interacted=true;}
        if(command==='interact_character'&&args.source==='sleep'&&disturbances<3){owned.affection=Math.max(0,owned.affection-1);disturbances++;}
        return {characters:[{...owned}],events:[]};
      }
      if(command==='chat_model_status'){
        if(settings.statusDelay)await new Promise(resolve=>setTimeout(resolve,settings.statusDelay));
        return {phase:settings.ready===false?(downloading?'downloading':'missing'):'ready',installed:settings.ready!==false,supported:true,total:100,downloaded:downloading?42:0,message:'AI를 한 번 준비해 주세요.'};
      }
      if(command==='download_chat_model')downloading=true;
      if(command==='stop_chat_model'){downloading=false;state.stops++;}
      if(command==='generate_chat_reply'){
        state.prompts.push(args.prompt);const call=++calls;
        if(settings.delay)await new Promise(resolve=>setTimeout(resolve,settings.delay));
        return settings.gomi?(call===1?'…조용히 해. 나 아직 졸려.':'…귀찮지만 네 옆에 있을게.'):call===1?'오늘은 네 손길이 반가워! 같이 놀아 볼까?':'오늘은 네 옆에서 느긋하게 쉬고 싶어.';
      }
      return [];
    }};
  },options);
}

test('opening AI settings cancels a reaction still waiting for relationship storage',async({page})=>{
  await installAi(page,{interactionDelay:800});await page.goto('/');
  await page.locator('.homeMascot').click();
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'AI 반응 설정',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(1800);
  expect(await page.evaluate(()=>(window as any).touchProbe.prompts)).toHaveLength(0);
});

for(const ready of [false,true])test(`Home never flashes a thinking label when AI is ${ready?'generating':'unavailable'}`,async({page})=>{
  await installAi(page,{ready,statusDelay:200,delay:1000});await page.goto('/');
  await page.locator('.homeMascot').evaluate(element=>{
    const home=element.closest('.homeCompanion')!;
    (window as any).thinkingLabelSeen=false;
    const observer=new MutationObserver(()=>{if(home.textContent?.includes('친구가 생각 중'))(window as any).thinkingLabelSeen=true;});
    observer.observe(home,{childList:true,subtree:true,characterData:true});
  });
  await page.locator('.homeMascot').click();
  if(ready)await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  else await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>(window as any).thinkingLabelSeen)).toBe(false);
});

for(const claimed of [false,true])test(`sleeping Home entry stays asleep with ${claimed?'claimed':'unclaimed'} daily greeting`,async({page})=>{
  await installAi(page,{gomi:true,affection:60});
  if(claimed)await page.addInitScript(()=>{
    const now=new Date();const day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    localStorage.setItem('gamjassak:gomi-greeting:gomi',day);
  });
  await page.goto('/');
  for(let entry=0;entry<2;entry++){
    await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion','sleep-curled');
    await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion',/^sleep-/);
    await expect(page.locator('#homeMessage')).toHaveText('…쌔근.');
    if(!claimed)expect(await page.evaluate(()=>localStorage.getItem('gamjassak:gomi-greeting:gomi'))).toBeNull();
    if(entry===0){
      await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
      await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();
    }
  }
});

test('sleeping Gomi keeps her sleep state and loses bounded affection when disturbed',async({page})=>{
  await installAi(page,{gomi:true,affection:20});
  await page.addInitScript(()=>localStorage.setItem('gamjassak:companion:v1:gomi',JSON.stringify({version:1,mood:'curious',energy:3,history:[]})));
  await page.goto('/');
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion',/^sleep-/);
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  for(const [index,name] of ['함께 산책','쓰다듬기','함께 놀기','간식 주기'].entries()){
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion',/^sleep-/);
    await expect(page.locator('.homeActivityMood')).toHaveCount(0);
    await expect(page.locator('.homeCharacterMeta')).toContainText(`친밀도 ${20-Math.min(index+1,3)}`);
  }
  await page.getByRole('button',{name:'함께 쉬기',exact:true}).click();
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-motion',/^sleep-/);
  await expect(page.locator('.homeActivityMood')).toHaveCount(0);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 17');
});

for (const gomi of [false, true]) test(`${gomi ? 'Gomi' : 'portrait'} touch and activity keep artwork visible while AI responds quietly`,async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await installAi(page,{gomi,delay:1000});await page.goto('/');
  const mascot=page.locator('.homeMascot');
  await expect(mascot.locator('.characterBody')).toHaveCSS('opacity','1');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  for (const button of [mascot,page.getByRole('button',{name:gomi?'함께 산책':'함께 쉬기',exact:true})]) {
    await mascot.evaluate(element=>{
      const body=element.querySelector('.characterBody')!;
      const illustration=element.querySelector('.characterIllustration')!;
      const gap=()=>element.getBoundingClientRect().top-document.querySelector('#homeMessage')!.getBoundingClientRect().bottom;
      const initialGap=gap();
      const probe=(window as any).continuity={running:true,artworkPreserved:true,opaque:true,stableGap:true};
      function sample(){
        probe.artworkPreserved&&=body.isConnected&&illustration.isConnected;
        const current=element.querySelector('.characterBody');
        probe.opaque&&=Boolean(current)&&Number(getComputedStyle(current!).opacity)>.99;
        probe.stableGap&&=Math.abs(gap()-initialGap)<1;
        if(probe.running)requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await button.click();
    await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
    const observation=await page.evaluate(()=>{
      const p=(window as any).continuity;p.running=false;
      return {artworkPreserved:p.artworkPreserved,opaque:p.opaque,stableGap:p.stableGap};
    });
    expect(observation).toEqual({artworkPreserved:true,opaque:true,stableGap:true});
  }
});

test('a slow Gomi pose keeps the decoded resting picture until its replacement is ready',async({page})=>{
  await installAi(page,{gomi:true});
  let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  let requested=false;
  await page.route('**/characters/gomi/sleep-curled-peek.png',async route=>{
    requested=true;await ready;await route.continue();
  });
  await page.goto('/');
  const image=page.locator('.homeMascot img');
  await expect(image).toHaveAttribute('src','/characters/gomi/sleep-curled.png');
  await image.evaluate((element:HTMLImageElement)=>element.decode());
  await page.locator('.homeMascot').click();
  try {
    await expect.poll(()=>requested).toBe(true);
    expect(await image.getAttribute('src')).toBe('/characters/gomi/sleep-curled.png');
    expect(await image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
  } finally {release();}
  await expect(image).toHaveAttribute('src','/characters/gomi/sleep-curled-peek.png');
});

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
