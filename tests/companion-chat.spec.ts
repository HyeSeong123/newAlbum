import {test,expect} from '@playwright/test';

test('unsupported device explains setup, cannot send, and returns focus on Back',async({page})=>{
  await page.goto('/');
  const open=page.getByRole('button',{name:'대화하기',exact:true});await open.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('RAM 8GB 이상 Android 스마트폰');
  await expect(dialog.getByLabel('친구에게 할 말')).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'메시지 보내기'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
});

test('free input saves each turn, retries without duplicates, stops and ignores late output',async({page})=>{
  await page.addInitScript(()=>{
    let calls=0;
    (window as any).__TAURI_INTERNALS__={
      convertFileSrc:()=>'/favicon.png',
      invoke:async(command:string)=>{
        if(command==='chat_model_status')return {phase:'ready',installed:true,supported:true,total:1107409472,downloaded:1107409472,message:'준비 완료'};
        if(command==='generate_chat_reply'){
          calls++;
          if(calls===1)throw '잠시 후 다시 시도해 주세요.';
          if(calls===2)return '오늘은 쉬어도 돼. 네 이야기를 듣고 있어.';
          await new Promise(resolve=>setTimeout(resolve,1400));return '취소한 오래된 대답';
        }
        if(command==='sync_characters')return {characters:[{id:'gomi',customName:null,growthStage:6,affection:30,isMain:true}],events:[]};
        return [];
      },
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'대화하기',exact:true}).click();
  const input=page.getByLabel('친구에게 할 말');await expect(input).toBeEnabled();
  await input.fill('오늘 조금 피곤했어');await page.getByRole('button',{name:'메시지 보내기'}).click();
  await expect(page.getByRole('alert')).toContainText('잠시 후 다시 시도');
  await page.getByRole('button',{name:'답변 다시 받기'}).click();
  await expect(page.getByRole('log')).toContainText('네 이야기를 듣고 있어');
  await expect(page.getByRole('log').getByText('오늘 조금 피곤했어',{exact:true})).toHaveCount(1);
  await input.fill('내일도 같이 놀자');await page.getByRole('button',{name:'메시지 보내기'}).click();
  await page.getByRole('button',{name:'대답 멈추기'}).click();
  await expect(page.getByRole('alert')).toContainText('대답을 멈췄어요');
  await page.waitForTimeout(1600);await expect(page.getByRole('log')).not.toContainText('취소한 오래된 대답');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gamjassak:chat:v1:gomi')!));
  expect(saved).toHaveLength(3);
  await page.getByRole('button',{name:'대화 닫기'}).click();
  await page.getByRole('button',{name:'대화하기',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('오늘 조금 피곤했어');
  await page.screenshot({path:'preview-results/companion-chat-conversation.png'});
});

test('download progress, cancellation and small mobile layout remain usable',async({page})=>{
  await page.setViewportSize({width:320,height:700});
  await page.addInitScript(()=>{
    let downloading=false;
    (window as any).__TAURI_INTERNALS__={convertFileSrc:()=>'/favicon.png',invoke:async(command:string)=>{
      if(command==='chat_model_status')return {phase:downloading?'downloading':'missing',installed:false,supported:true,total:100,downloaded:downloading?42:0,message:'먼저 AI를 준비해 주세요.'};
      if(command==='download_chat_model')downloading=true;
      if(command==='stop_chat_model')downloading=false;
      if(command==='sync_characters')return {characters:[{id:'potato',customName:null,growthStage:1,affection:0,isMain:true}],events:[]};
      return [];
    }};
  });
  await page.goto('/');await page.getByRole('button',{name:'대화하기',exact:true}).click();
  await page.getByRole('button',{name:'AI 다운로드',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','42');
  await page.getByRole('button',{name:'다운로드 취소'}).click();
  await expect(page.getByRole('button',{name:'AI 다운로드',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const send=(await page.getByRole('button',{name:'메시지 보내기'}).boundingBox())!;
  const help=(await page.getByRole('button',{name:'현재 화면 도움말',exact:true}).boundingBox())!;
  expect(send.x+send.width).toBeLessThanOrEqual(help.x-4);
  await page.screenshot({path:'preview-results/companion-chat-320.png'});
});
