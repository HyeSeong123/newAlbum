import {test,expect} from '@playwright/test';

async function installAi(page:any, options:{ready?:boolean;delay?:number;gomi?:boolean;affection?:number;statusDelay?:number;interactionDelay?:number;error?:string;longReply?:boolean;echoFirst?:boolean;legacy?:boolean;controlledGeneration?:boolean;actionReplies?:boolean}={}) {
  await page.addInitScript((settings:any)=>{
    Math.random=()=>settings.gomi?.55:.1;
    let downloading=false, interacted=false, calls=0, disturbances=0;
    const owned={id:settings.gomi?'gomi':'potato',customName:null,growthStage:6,affection:settings.affection||0,isMain:true};
    const state=(window as any).touchProbe={prompts:[] as string[],stops:0,releases:0,error:settings.error};
    (window as any).__TAURI_INTERNALS__={convertFileSrc:()=>'/favicon.png',invoke:async(command:string,args:any={})=>{
        if (command === 'check_android_location_setup') return { locationEnabled: true, photoLocationGranted: true };
      if(command==='sync_characters'||command==='interact_character'){
        if(command==='interact_character'&&settings.interactionDelay)await new Promise(resolve=>setTimeout(resolve,settings.interactionDelay));
        if(command==='interact_character'&&args.source==='home'&&!interacted){owned.affection++;interacted=true;}
        if(command==='interact_character'&&args.source==='sleep'&&disturbances<3){owned.affection=Math.max(0,owned.affection-1);disturbances++;}
        return {characters:[{...owned}],events:[]};
      }
      if(command==='chat_model_status'){
        if(settings.statusDelay)await new Promise(resolve=>setTimeout(resolve,settings.statusDelay));
        return {phase:downloading?'downloading':settings.ready===false?'missing':'ready',installed:settings.ready!==false,supported:true,total:100,downloaded:downloading?42:0,message:'AI를 한 번 준비해 주세요.',model:settings.legacy?'legacy':'dialogue',upgradeAvailable:Boolean(settings.legacy)};
      }
      if(command==='download_chat_model')downloading=true;
      if(command==='stop_chat_model'){downloading=false;state.stops++;}
      if(command==='release_chat_model'){state.releases++;}
      if(command==='generate_chat_reply'){
        state.prompts.push(args.prompt);const call=++calls;
        if(settings.controlledGeneration)await new Promise(resolve=>{(state as any).finish=resolve;});
        if(settings.delay)await new Promise(resolve=>setTimeout(resolve,settings.delay));
        if(state.error)throw state.error;
        if(settings.actionReplies)return ['오늘은 걷는 얘기를 하자.','네가 건넨 마음은 기억할게.','조심스러운 손길이면 괜찮아.','규칙부터 같이 정해 보자.','이제 조금 조용해져도 좋겠네.'][call-1];
        if(settings.longReply)return '조용히 곁에 있어 줘. 조금 더 자고 싶어. '+ '따뜻하고 편안한 잠을 자고 싶은 아침이야. '.repeat(8);
        if(settings.echoFirst&&call===1)return document.querySelector('#homeMessage')!.textContent;
        return settings.gomi?(call===1?'…조용히 해. 나 아직 졸려.':'…귀찮지만 네 옆에 있을게.'):call===1?'오늘은 네 손길이 반가워! 같이 놀아 볼까?':'오늘은 네 옆에서 느긋하게 쉬고 싶어.';
      }
      return [];
    }};
  },options);
}

test('an installed legacy AI stays available and its upgrade is explicit and cancellable',async({page})=>{
  await page.setViewportSize({width:320,height:700});await installAi(page,{legacy:true});await page.goto('/');
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('2.5GB');
  await page.getByRole('button',{name:'더 자연스러운 AI 받기',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','42');
  await page.getByRole('button',{name:'다운로드 취소',exact:true}).click();
  await expect(page.getByRole('button',{name:'더 자연스러운 AI 받기',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('dialog').screenshot({path:'preview-results/ai-optional-upgrade-320.png'});
});

test('repeated touches finish one slow AI reaction without restarting it',async({page})=>{
  await installAi(page,{delay:1400});await page.goto('/');
  await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  for(let i=0;i<4;i++){await page.locator('.homeMascot').click();await page.waitForTimeout(100);}
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await expect(page.locator('#homeMessage')).toContainText('네 손길이 반가워');
  expect(await page.evaluate(()=>(window as any).touchProbe.stops)).toBe(0);
  expect(await page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await expect(page.getByText('친구가 생각 중',{exact:false})).toHaveCount(0);
});

test('same-state storage resumes an already completed AI answer without generating again',async({page})=>{
  await installAi(page,{interactionDelay:800,controlledGeneration:true});await page.goto('/');
  await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await page.locator('.homeMascot').dispatchEvent('click');
  await page.evaluate(()=>(window as any).touchProbe.finish());
  await page.waitForTimeout(150);
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','local-rules');
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await expect(page.locator('#homeMessage')).toContainText('네 손길이 반가워');
  expect(await page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
});

test('a completed old AI answer stays hidden while a changed sleeping relationship is saving',async({page})=>{
  await installAi(page,{gomi:true,affection:20,interactionDelay:1400,delay:800});await page.goto('/');
  await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  await page.getByRole('button',{name:'함께 산책',exact:true}).click();
  await page.waitForTimeout(950);
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','local-rules');
  await expect(page.locator('#homeMessage')).not.toContainText('나 아직 졸려');
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  const prompts=await page.evaluate(()=>(window as any).touchProbe.prompts);
  expect(prompts).toHaveLength(2);expect(prompts[1]).toContain('친밀도: 19');expect(prompts[1]).toContain('짜증');
});

for(const echoFirst of [false,true])test(`${echoFirst?'copied':'long'} AI answer reaches the bubble as a fresh short line`,async({page})=>{
  await installAi(page,{echoFirst,longReply:!echoFirst});await page.goto('/');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  await page.getByRole('button',{name:'함께 쉬기',exact:true}).click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await expect(page.locator('#homeMessage')).toHaveText(echoFirst?'오늘은 네 옆에서 느긋하게 쉬고 싶어.':'조용히 곁에 있어 줘. 조금 더 자고 싶어.');
});

test('a failed AI run is explained in settings and a successful retry clears it',async({page})=>{
  await installAi(page,{error:'다른 앱을 잠시 닫고 다시 이야기해 주세요.'});await page.goto('/');
  await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('AI 모델이 설치되어 있어요');
  await page.getByRole('dialog').screenshot({path:`preview-results/ai-execution-status-${process.env.RELIABILITY_BASELINE?'before':'after'}.png`});
  await expect(page.getByRole('dialog')).toContainText('메모리가 부족해');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>(window as any).touchProbe.error=undefined);
  await page.locator('.homeMascot').click();
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('AI가 새로운 대사를 만들었어요');
  await expect(page.getByRole('dialog')).not.toContainText('메모리가 부족해');
});

test('opening AI settings retains a reaction waiting for relationship storage and shows its actual outcome',async({page})=>{
  await installAi(page,{interactionDelay:800});await page.goto('/');
  await page.locator('.homeMascot').click();
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'AI 반응 설정',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('AI가 새로운 대사를 만들었어요');
  expect(await page.evaluate(()=>(window as any).touchProbe.stops)).toBe(0);
  expect(await page.evaluate(()=>(window as any).touchProbe.releases)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
});

test('settings during slow generation preserves the new bubble and Home navigation releases the model',async({page})=>{
  await installAi(page,{controlledGeneration:true});await page.goto('/');
  await page.locator('.homeMascot').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.prompts.length)).toBe(1);
  await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Qwen3 4B · 설치됨');
  await page.evaluate(()=>(window as any).touchProbe.finish());
  await expect(page.getByRole('dialog')).toContainText('AI가 새로운 대사를 만들었어요');
  expect(await page.evaluate(()=>(window as any).touchProbe.stops)).toBe(0);
  await page.getByRole('dialog').screenshot({path:'preview-results/ai-home-session-success.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#homeMessage')).toContainText('네 손길이 반가워');
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).touchProbe.releases)).toBe(1);
});

test('another character does not inherit an unattributed native failure as its own recent reaction',async({page})=>{
  await installAi(page);
  await page.addInitScript(()=>{
    const internals=(window as any).__TAURI_INTERNALS__,original=internals.invoke;
    internals.invoke=async(command:string,args:any)=>command==='chat_model_status'
      ?{...(await original(command,args)),lastOutcome:'error',lastError:'AI_ENGINE: AI 실행기를 불러오지 못했어요.',runtime:{resident:false,stage:'error',loadMs:12}}
      :original(command,args);
  });
  await page.goto('/');await page.getByRole('button',{name:'AI 반응 설정',exact:true}).click();
  await expect(page.locator('.companionAiOutcome > p').last()).toContainText('아직 AI 반응 결과가 없어요');
  await page.getByText('앱의 최근 실행 기록 보기',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('AI 실행기를 불러오지 못했어요');
});

test('five sleeping fallback reactions stay distinct when the AI cannot allocate',async({page})=>{
  await installAi(page,{gomi:true,error:'AI_MEMORY: 메모리가 부족해요.'});await page.goto('/');
  const lines=[];
  for(let i=0;i<5;i++){
    await page.locator('.homeMascot').click();
    lines.push(await page.locator('#homeMessage').textContent());
  }
  expect(new Set(lines).size).toBe(5);
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  const rest=[];
  for(let i=0;i<6;i++){
    await page.getByRole('button',{name:'함께 쉬기',exact:true}).click();
    rest.push(await page.locator('#homeMessage').textContent());
  }
  expect(new Set(rest).size).toBe(6);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
});

test('all five actions send their current situation to AI and show the returned new line',async({page})=>{
  await installAi(page,{gomi:true,actionReplies:true});await page.goto('/');
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  const replies=['오늘은 걷는 얘기를 하자.','네가 건넨 마음은 기억할게.','조심스러운 손길이면 괜찮아.','규칙부터 같이 정해 보자.','이제 조금 조용해져도 좋겠네.'];
  for(const [index,name] of ['함께 산책','간식 주기','쓰다듬기','함께 놀기','함께 쉬기'].entries()){
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('#homeMessage')).toHaveAttribute('data-source','on-device');
    await expect(page.locator('#homeMessage')).toHaveText(replies[index]);
    const prompt=await page.evaluate((i)=>(window as any).touchProbe.prompts[i],index);
    expect(prompt).toContain(`'${name}' 행동`);
    expect(prompt).toContain(index===4?'나른함':'짜증');
  }
});

test('background and return invalidate a reaction still waiting for relationship storage',async({page})=>{
  await installAi(page,{interactionDelay:800});await page.goto('/');
  await page.locator('.homeMascot').click();
  await page.evaluate(()=>{
    let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    document.dispatchEvent(new Event('visibilitychange'));
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  });
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
