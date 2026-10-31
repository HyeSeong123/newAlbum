import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { toStep } from './fixtures/helpSpotlight';
import { characterPortraits } from '../src/features/characters/characterPortraits';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json','utf8')) as Array<{ id:string; defaultName:string; regionLabel:string; maxStage:number; fixedGrowthStage?:number; stageAssetPaths?:string[]; expressionAssetPaths?:Record<string,string> }>;
test.beforeEach(async ({page}) => { await page.addInitScript(()=>{Math.random=()=>.1;}); });

type Companion = { id:string; customName:string|null; growthStage:number; regionPhotoCount:number; growthPhotoCount:number; affection:number; isMain:boolean; unlockedAt:string; createdAt:string; updatedAt:string };
const companion = (id:string,stage=1,isMain=false):Companion => ({ id,customName:null,growthStage:stage,regionPhotoCount:0,growthPhotoCount:0,affection:0,isMain,unlockedAt:'2026-10-03',createdAt:'2026-10-03',updatedAt:'2026-10-03' });
async function installSnapshot(page:Page,initial:Companion[],event?:{ id:number; characterId:string; kind:string; stage:number }) {
  if (!initial.some(c => c.id === 'gomi')) initial = [...initial, companion('gomi', 6)];
  await page.addInitScript(({ initial,event }) => {
    let characters = initial;
    let events = event ? [event] : [];
    const commands:Array<{ command:string; args:Record<string,unknown> }> = [];
    const clicked = new Set<string>();
    let sleepDisturbances=0;
    Object.assign(window, { sproutCommands:commands,setSproutStage:(stage:number) => {
      characters = characters.map(c => ({ ...c,growthStage:stage }));
      window.dispatchEvent(new Event('focus'));
    } });
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value: { convertFileSrc:() => '/favicon.png',invoke:async(command:string,args:Record<string,unknown>={}) => {
      commands.push({ command,args });
      if(command === 'list_media' || command === 'list_albums' || command === 'list_diary') return [];
      if(command === 'dismiss_character_event') events=events.filter(e=>e.id !== args.eventId);
      if(command === 'rename_character') characters=characters.map(c=>c.id === args.id ? { ...c,customName:args.name as string } : c);
      if(command === 'set_main_character') characters=characters.map(c=>({ ...c,isMain:c.id === args.id }));
      if(command === 'interact_character' && args.source === 'home' && !clicked.has(args.id as string)) {
        clicked.add(args.id as string);
        characters=characters.map(c=>c.id === args.id && c.isMain ? { ...c,affection:c.affection+1 } : c);
      }
      if(command === 'interact_character' && args.source === 'sleep' && sleepDisturbances<3) {
        sleepDisturbances++;
        characters=characters.map(c=>c.id === args.id && c.isMain ? { ...c,affection:Math.max(0,c.affection-1) } : c);
      }
      return { characters,events };
    } } });
  },{ initial,event });
}
const cardFor = (page:Page,name:string) => page.locator('.characterCard').filter({ has:page.getByRole('heading',{ name,exact:true }) });

test('other friends keep their drawing while five activities and quiet rest have distinct motions', async ({page},testInfo) => {
  await installSnapshot(page,[companion('potato',6,true)]);
  await page.clock.install({time:new Date('2026-10-26T12:00:00')});
  await page.clock.pauseAt(new Date('2026-10-26T12:01:00'));
  await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');
  await page.clock.fastForward(3_000);
  await expect(visual).toHaveAttribute('data-motion','nod');
  await page.evaluate(()=>{(window as any).originalFriendDrawing=document.querySelector('.homeMascot .characterPortrait image');});
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  for(const [label,motion] of [['함께 산책','walk'],['햇살 선물','treat'],['쓰다듬기','pet'],['함께 놀기','play'],['함께 쉬기','rest']]) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(visual).toHaveAttribute('data-motion',motion);
    expect(await page.evaluate(()=>(window as any).originalFriendDrawing===document.querySelector('.homeMascot .characterPortrait image'))).toBe(true);
    await expect(page.locator('.homeSpeech')).not.toContainText(/생각\s*중|로딩/);
  }
  await page.clock.fastForward(60_000);
  await expect(visual).toHaveAttribute('data-motion','rest');
  await expect(page.locator('.homeMascot .characterHeart')).toHaveCount(0);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  expect(await page.evaluate(()=>(window as any).sproutCommands.filter((c:any)=>c.command==='interact_character').length)).toBe(0);
  await page.screenshot({path:testInfo.outputPath('friend-rest.png')});
  await page.locator('.homeMascot').click();
  await expect(visual).toHaveAttribute('data-motion','nod');
  // The visible brother nod lasts 3.5 seconds; it must neither end early nor get stuck.
  await page.clock.runFor(3_400);
  await expect(visual).toHaveAttribute('data-motion','nod');
  await page.clock.runFor(200);
  await expect(visual).toHaveAttribute('data-motion','rest');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
});

for (const [id, name] of [['potato','감자싹'],['sweet-potato','고구마싹']] as const) {
  test(`${name} has four unique touches and five illustrated actions without replacing the portrait`, async ({page},testInfo) => {
    await installSnapshot(page,[companion(id,6,true)]);
    await page.goto('/');
    const visual=page.locator('.homeMascot .characterVisual');
    await expect(visual).toHaveAttribute('data-character',id);
    await expect(visual).toHaveAttribute('data-motion-style','brothers');
    await page.evaluate(()=>{(window as any).savedPortrait=document.querySelector('.homeMascot .characterPortrait image');});
    const touchMotions=new Set<string>();
    for(let touch=0;touch<4;touch++) {
      await page.locator('.homeMascot').click();
      const gesture=await visual.getAttribute('data-motion');
      expect(gesture).toBeTruthy();
      touchMotions.add(gesture!);
    }
    expect(touchMotions.size).toBe(4);
    await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
    await page.getByRole('button',{name:'함께하기',exact:true}).click();
    for (const [label, motion, effect] of [
      ['함께 산책','walk','steps'],['햇살 선물','treat','shine'],['쓰다듬기','pet','heart'],
      ['함께 놀기','play','stars'],['함께 쉬기','rest','sleep'],
    ] as const) {
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(visual).toHaveAttribute('data-motion',motion);
      const activeEffect=visual.locator(`.brotherFx[data-brother-effect="${effect}"]`);
      // Previous effects can overlap briefly during their exit transition.
      await expect(activeEffect).toHaveCount(1);
      await expect(activeEffect).toBeVisible();
      expect(await page.evaluate(()=>(window as any).savedPortrait===document.querySelector('.homeMascot .characterPortrait image'))).toBe(true);
    }
    await expect(visual.locator('.brotherGround')).toHaveCount(1);
    await expect(page.locator('.homeMascot .characterHeart')).toHaveCount(0);
    await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
    expect(await page.evaluate(()=>(window as any).sproutCommands.filter((c:any)=>c.command==='interact_character').length)).toBe(4);
    if (testInfo.project.name === 'mobile') {
      await page.screenshot({path:`preview-results/home-brothers-${id}-mobile.png`});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
  });
}

test('returning Home rotates visible poses without changing affection', async ({page}) => {
  await installSnapshot(page,[companion('potato',6,true)]);
  await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');
  const poses:string[]=[];
  for (let visit=0;visit<4;visit++) {
    const pose=await visual.getAttribute('data-motion');
    expect(pose).toBeTruthy();
    poses.push(pose!);
    await expect(visual).toHaveAttribute('data-motion',pose!);
    await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
    await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();
  }
  expect(new Set(poses).size).toBe(4);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
});

test('friend reactions pause in background and cleanly restart on another Home entry',async({page})=>{
  await installSnapshot(page,[companion('potato',6,true)]);
  await page.clock.install({time:new Date('2026-10-26T12:00:00')});
  await page.clock.pauseAt(new Date('2026-10-26T12:01:00'));
  await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');
  await page.clock.fastForward(3_000);
  await page.locator('.homeMascot').click();
  await expect(visual).toHaveAttribute('data-motion','look-around');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(visual).toHaveAttribute('data-paused','true');
  await page.clock.fastForward(30_000);
  await expect(visual).toHaveAttribute('data-motion','look-around');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(visual).toHaveAttribute('data-paused','false');
  // Resuming starts the full 4.6-second look-around again before restoring the Home pose.
  await page.clock.runFor(4_500);
  await expect(visual).toHaveAttribute('data-motion','look-around');
  await page.clock.runFor(200);
  await expect(visual).toHaveAttribute('data-motion','nod');
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await page.clock.fastForward(10_000);
  await page.locator('.navList').getByRole('button',{name:'홈',exact:true}).click();
  await expect(visual).toHaveAttribute('data-motion','look-around');
});

test('other friends respect reduced motion from Home entry through explicit activities',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[companion('potato',6,true)]);
  await page.clock.install({time:new Date('2026-10-26T12:00:00')});
  await page.clock.pauseAt(new Date('2026-10-26T12:01:00'));
  await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');
  await expect(visual).toHaveAttribute('data-reduced-motion','true');
  const bodyPose=()=>visual.locator('.characterBody').evaluate(el=>{
    const {a,b,c,d,e,f}=new DOMMatrix(getComputedStyle(el).transform);
    return [a,b,c,d,e,f];
  });
  await page.clock.runFor(100);
  const homePose=await bodyPose();
  // Reduced motion keeps the chosen silhouette while stopping its animation.
  expect(homePose).not.toEqual([1,0,0,1,0,0]);
  await page.clock.runFor(1_000);
  expect(await bodyPose()).toEqual(homePose);
  await page.getByRole('button',{name:'함께하기',exact:true}).click();
  await page.getByRole('button',{name:'함께 산책',exact:true}).click();
  await expect(visual).toHaveAttribute('data-motion','walk');
  await page.clock.runFor(100);
  const walkPose=await bodyPose();
  expect(walkPose).not.toEqual(homePose);
  await page.clock.runFor(1_000);
  await expect(visual).toHaveAttribute('data-motion','walk');
  expect(await bodyPose()).toEqual(walkPose);
  await page.clock.runFor(1_800);
  await expect(visual).toHaveAttribute('data-motion','nod');
  // Motion applies the restored posture on the frame after React changes it.
  await page.clock.runFor(100);
  expect(await bodyPose()).toEqual(homePose);
  await page.clock.runFor(1_000);
  expect(await bodyPose()).toEqual(homePose);
});

test('Gomi rests awake with front paws extended and returns to the pose after talking', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[companion('gomi',6,true)]);
  await page.addInitScript(()=>{Math.random=()=>.3;});
  await page.clock.install({time:new Date('2026-10-14T12:00:00')});
  await page.goto('/');
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  const visual=mascot.locator('.characterVisual');
  await expect(visual).toHaveAttribute('data-motion','rest-front');
  await expect(visual).toHaveAttribute('data-expression','cynical');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/rest-front.png');
  await mascot.locator('img').evaluate((img:HTMLImageElement)=>img.decode());
  await expect(page.locator('#homeMascotHint')).toHaveCount(0);
  await expect(mascot).not.toHaveAttribute('aria-describedby', 'homeMascotHint');
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion','cynical');
  await page.clock.fastForward(1_800);
  await expect(visual).toHaveAttribute('data-motion','rest-front');
  await page.clock.fastForward(600_000);
  await expect(visual).toHaveAttribute('data-motion','rest-front');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
});

test('the starter potato has a visible portrait and the book reveals no discovery or growth hints',async({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  const book=page.locator('.characterBook');
  const potato=cardFor(page,'감자싹');
  await expect(potato.locator('.characterPortrait image')).toHaveAttribute('href','/characters/portraits/potato-source.png');
  await expect(potato.locator('[data-portrait="감자"]')).toBeVisible();
  const box=(await potato.locator('.characterVisual').boundingBox())!;
  expect(box.width).toBeGreaterThan(160);
  expect(box.height).toBeGreaterThan(160);
  await expect(page.locator('.characterCard.locked')).toHaveCount(14);
  await expect(book.locator('.characterVisual')).toHaveCount(3);
  await expect(book.locator('details,progress,.characterStats,.characterPersonality,.characterRegion')).toHaveCount(0);
  await expect(book.getByRole('button',{name:/교감|말 걸기/})).toHaveCount(0);
  await expect(book).not.toContainText(/GPS|친밀도|성장 과정|완성하면|10장|30장|60장/);
  for(const def of definitions.filter(d => d.regionLabel)) await expect(book).not.toContainText(def.regionLabel);
  await page.screenshot({path:`test-results/character-book-${test.info().project.name}.png`,fullPage:true});
});

test('book viewing, portraits, rename and main selection never interact; only Home raises affection',async({page}) => {
  await installSnapshot(page,[companion('potato',1,true),companion('sweet-potato'),companion('orange',3)]);
  await page.goto('/');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  const orange=page.locator('.characterCard').filter({has:page.locator('.characterVisual[data-character="orange"]')});
  await orange.locator('.characterCardArt').click();
  await orange.getByRole('button',{name:'이름 바꾸기'}).click();
  await orange.getByLabel('친구 이름').fill('귤이');
  await orange.getByRole('button',{name:'저장'}).click();
  await orange.getByRole('button',{name:'대표로 설정'}).click();
  const interactions = () => page.evaluate(()=> (window as unknown as { sproutCommands:Array<{command:string;args:Record<string,unknown>}> }).sproutCommands.filter(c=>c.command === 'interact_character'));
  expect(await interactions()).toEqual([]);
  await page.getByRole('button',{name:'곰고미 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  await page.getByRole('button',{name:'귤이에게 말 걸기'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(page.locator('.homeMascot .characterVisual')).toHaveAttribute('data-expression','happy');
  expect((await interactions())[0].args).toEqual({ id:'orange',source:'home' });
  await page.getByRole('button',{name:'친구들 보기'}).click();
  await cardFor(page,'귤이').locator('.characterCardArt').click();
  await page.getByRole('button',{name:'곰고미 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  expect(await interactions()).toHaveLength(1);
});

test('a discovered friend can be named and selected without explaining how it was found',async({page}) => {
  await installSnapshot(page,[companion('potato',1,true),companion('sweet-potato'),companion('orange',3)],{id:1,characterId:'orange',kind:'unlock',stage:3});
  await page.goto('/');
  const dialog=page.getByRole('dialog',{name:'새로운 새싹을 발견했어요!'});
  await expect(dialog).not.toContainText(/GPS|제주|장/);
  await dialog.getByRole('button',{name:'만나보기'}).click();
  await expect(cardFor(page,'귤싹')).toBeVisible();
  await expect(page.locator('.characterCard.locked')).toHaveCount(13);
});

test('each of the six current forms loads without showing any future form',async({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,definitions.map(d=>companion(d.id,1,d.id === 'potato')));
  await page.goto('/');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  for(const stage of [1,2,3,4,5,6]) {
    await page.evaluate(stage=>(window as unknown as {setSproutStage:(stage:number)=>void}).setSproutStage(stage),stage);
    await expect(cardFor(page,'감자싹').locator('.characterVisual')).toHaveAttribute('data-stage',String(stage));
    await expect(page.locator('.characterBook .characterVisual')).toHaveCount(17);
    for(const def of definitions) {
      const art=cardFor(page,def.defaultName);
      const portrait=characterPortraits[def.id];
      if(portrait){
        await expect(art.locator('.characterPortrait image')).toHaveAttribute('href',portrait.src);
        await expect(art.locator('.characterPortrait')).toHaveAttribute('viewBox',portrait.viewBox);
        await expect(art.locator('.characterPortrait')).toBeVisible();
      }else{
        const image=art.locator('.characterCardArt img');
        await expect(image).toHaveAttribute('src','/characters/gomi/cynical.png');
        await image.evaluate((img:HTMLImageElement)=>img.decode());
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if(test.info().project.name === 'desktop') await page.screenshot({path:`test-results/sprouts-current-stage-${stage}.png`,fullPage:true});
  }
});

test('redesigned completed potato uses its new picture and reduced motion still permits Home affection',async({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[companion('potato',6,true),companion('sweet-potato')]);
  await page.goto('/');
  const mascot=page.getByRole('button',{name:'감자싹에게 말 걸기'});
  await expect(mascot.locator('.characterPortrait image')).toHaveAttribute('href','/characters/portraits/potato-source.png');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-reduced-motion','true');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('.characterPortrait image')).toHaveAttribute('href','/characters/portraits/potato-source.png');
  await expect(mascot.locator('.characterHeart')).toHaveCount(0);
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-expression','idle',{timeout:2500});
});

test('Gomi starts as an adult main; help and book never award affection and home changes her expression', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const mascot = page.getByRole('button', {name:'고미에게 말 걸기'});
  await expect(mascot.locator('img')).toHaveAttribute('src', '/characters/gomi/cynical.png');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-stage', '6');
  await page.getByRole('button', {name:'현재 화면 도움말'}).click();
  const guide = page.getByRole('dialog', {name:'버튼 도움말'});
  await expect(guide.locator('.characterHelpName')).toHaveText('고미');
  await toStep(page, '친구들 보기');
  await expect(guide.locator('#helpInstruction')).toContainText('친밀도는 오르지');
  await guide.getByRole('button', {name:'도움말 종료'}).click();
  await page.getByRole('button', {name:'친구들 보기'}).click();
  await expect(cardFor(page,'고미')).toBeVisible();
  await expect(cardFor(page,'고미').locator('.characterVisual')).toHaveAttribute('data-stage','6');
  await page.getByRole('button', {name:'곰고미 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('img')).toHaveAttribute('src', '/characters/gomi/cynical.png');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-stage', '6');
  await page.screenshot({path:`preview-results/gomi-home-${test.info().project.name}.png`,fullPage:true});
});

test('Gomi help follows the current screen and retains focus before the real import flow', async ({page}) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  const opener = page.getByRole('button', {name:'현재 화면 도움말'});
  await opener.click();
  const guide = page.getByRole('dialog',{name:'버튼 도움말'});
  await expect(guide.getByRole('heading',{name:'인물',exact:true})).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(guide.getByRole('button',{name:'다음',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(guide.getByRole('button',{name:'도움말 종료'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden(); await expect(opener).toBeFocused();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();
  await opener.click();
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'반려동물',exact:true})).toBeVisible();
  await guide.getByRole('button',{name:'도움말 종료'}).click();
  await page.locator('.navList').getByRole('button',{name:'사진 기록',exact:true}).click();
  await opener.click();
  await expect(guide).toBeVisible();
  await page.screenshot({path:`preview-results/gomi-guide-${test.info().project.name}.png`});
  await guide.getByRole('button',{name:'도움말 종료'}).click();
  await page.getByRole('button',{name:'사진·영상 가져오기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'사진·영상 가져오기'})).toBeVisible();
});

test('Gomi tutorial navigation fits a short narrow phone with larger text', async ({page, isMobile}) => {
  test.skip(!isMobile, 'Phone geometry.');
  await page.setViewportSize({width:320,height:480});
  await page.goto('/');
  await page.getByRole('button',{name:'크게 보기',exact:true}).click();
  await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  const guide = page.getByRole('dialog',{name:'버튼 도움말'});
  await expect(guide.getByRole('heading',{name:'인물',exact:true})).toBeVisible();
  const card=guide.locator('.helpGuideCard');
  await expect(card).toBeInViewport();
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'반려동물',exact:true})).toBeVisible();
  await expect(guide.getByRole('button',{name:'다음',exact:true})).toBeInViewport();
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({path:'preview-results/gomi-guide-short-phone.png'});
});

test('help uses the selected main character instead of Gomi', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  await cardFor(page,'감자싹').getByRole('button',{name:'대표로 설정'}).click();
  await page.getByRole('button',{name:'곰고미 홈으로 이동'}).click();
  await expect(page.getByRole('button',{name:'감자싹에게 말 걸기'})).toBeVisible();
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  await expect(page.getByRole('dialog',{name:'버튼 도움말'}).locator('.characterVisual')).toHaveAttribute('data-character','potato');
});

for (const scenario of [
  { name:'curled', date:'2026-03-01T12:00:00', roll:.5, pose:'sleep-curled' },
  { name:'stretched', date:'2026-04-01T12:00:00', roll:.65, pose:'sleep-stretched' },
  { name:'cool quilt', date:'2026-05-01T12:00:00', roll:.8, pose:'sleep-cool' },
  { name:'warm blanket', date:'2027-02-01T12:00:00', roll:.8, pose:'sleep-warm' },
]) test(`Gomi ${scenario.name} stays asleep, peeks with one eye, gets angry and settles without extra affection`, async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[{...companion('gomi',6,true),affection:20}]);
  await page.addInitScript(roll=>{Math.random=()=>roll;},scenario.roll);
  await page.clock.install({time:new Date(scenario.date)});
  await page.goto('/');
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  const visual=mascot.locator('.characterVisual');
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await expect(mascot.locator('img')).toHaveAttribute('src',`/characters/gomi/${scenario.pose}.png`);
  await mascot.locator('img').evaluate((img:HTMLImageElement)=>img.decode());
  await page.clock.fastForward(600_000);
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 20');
  expect(await page.evaluate(()=>(window as unknown as {sproutCommands:Array<{command:string}>}).sproutCommands.filter(c=>c.command==='interact_character'))).toHaveLength(0);
  await page.screenshot({path:`preview-results/gomi-${scenario.pose}-${test.info().project.name}.png`});
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-peek`);
  await expect(visual).toHaveAttribute('data-expression','peek');
  await expect(mascot.locator('img')).toHaveAttribute('src',`/characters/gomi/${scenario.pose}-peek.png`);
  await expect(page.locator('#homeMessage')).toContainText(/자|잘|졸|눈|쉬/);
  const spoken = [await page.locator('#homeMessage').textContent()];
  await page.clock.fastForward(1_800);
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-peek`);
  spoken.push(await page.locator('#homeMessage').textContent());
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-angry`);
  await expect(visual).toHaveAttribute('data-expression','angry');
  await expect(mascot.locator('img')).toHaveAttribute('src',`/characters/gomi/${scenario.pose}-angry.png`);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 19');
  await expect(page.locator('#homeMessage')).toContainText(/자|깨|졸|잠|눈|손/);
  spoken.push(await page.locator('#homeMessage').textContent());
  await expect(visual).toHaveAttribute('data-stage','6');
  await page.screenshot({path:`preview-results/gomi-${scenario.pose}-angry-${test.info().project.name}.png`});
  await page.clock.fastForward(2_600);
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await page.clock.fastForward(10_001);
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-peek`);
  await expect(page.locator('#homeMessage')).toContainText(/자|잘|졸|잠|눈|손/);
  spoken.push(await page.locator('#homeMessage').textContent());
  expect(new Set(spoken).size).toBe(4);
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 19');
});

test('Gomi draws a new pose only on Home entry; visibility, help and data refresh do not reroll', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[companion('gomi',6,true)]);
  await page.clock.install({time:new Date('2026-10-01T12:00:00')});
  await page.goto('/');
  const visual=page.locator('.homeMascot .characterVisual');
  await expect(visual).toHaveAttribute('data-motion','cynical');
  await page.evaluate(()=>{Math.random=()=>.8;});
  await page.clock.fastForward(600_000);
  await expect(visual).toHaveAttribute('data-motion','cynical');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  await page.getByRole('button',{name:'곰고미 홈으로 이동'}).click();
  await expect(visual).toHaveAttribute('data-motion','sleep-warm');
  await page.evaluate(()=>{
    Math.random=()=>.95;
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(120_000);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(visual).toHaveAttribute('data-motion','sleep-warm');
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  await page.clock.fastForward(120_000);
  await page.getByRole('button',{name:'도움말 종료'}).click();
  await expect(visual).toHaveAttribute('data-motion','sleep-warm');
  await page.getByRole('button',{name:'친구들 보기'}).click();
  await page.getByRole('button',{name:'곰고미 홈으로 이동'}).click();
  await expect(visual).toHaveAttribute('data-motion','stretch');
  await page.clock.fastForward(2_400);
  await expect(visual).toHaveAttribute('data-motion','cynical');
  await page.clock.fastForward(600_000);
  await expect(visual).toHaveAttribute('data-motion','cynical');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
});

test('Gomi still ignores repeated touches around 20 and never offers a paw or lick there', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[{...companion('gomi',6,true),affection:19}]);
  await page.goto('/');
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  for (let n=0;n<4;n++) {
    await mascot.click();
    await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-motion','cynical');
    await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/cynical.png');
  }
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 20');
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  await expect(page.getByRole('dialog',{name:'버튼 도움말'}).locator('.characterVisual')).toHaveAttribute('data-motion','cynical');
});

test('bonded Gomi actually alternates paw and tongue drawings while her adult stage stays fixed', async ({page}) => {
  await installSnapshot(page,[{...companion('gomi',6,true),affection:90}]);
  await page.goto('/');
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  const visual=mascot.locator('.characterVisual');
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion','paw-wave');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/paw-wave-down.png');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/paw-wave-up.png');
  await page.screenshot({path:`preview-results/gomi-paw-wave-${test.info().project.name}.png`});
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion','lick');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/lick.png');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/gomi/happy.png');
  await expect(visual).toHaveAttribute('data-stage','6');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 91');
  await page.screenshot({path:`preview-results/gomi-lick-${test.info().project.name}.png`});
});

for (const scenario of [
  { score:0, home:'........누구....?', photo:'…휴. 사진은 직접 골라.', opening:'…가져오기부터.', description:'못 들은 척', motion:'cynical' },
  { score:20, home:'......왔네....', photo:'사진? 가져오기 눌러. 끝.', opening:'고르는 건 네 몫이야.', description:'반가운 기색은 없어요', motion:'cynical' },
  { score:30, home:'...자주 오네..', photo:'휴. 마음에 드는 거부터 골라. 전부 넣을 필요 없잖아.', opening:'몇 장만 골라. 정리까지 하긴 귀찮으니까.', description:'이런 것도 말해야 해?', motion:'cynical' },
  { score:60, home:'기다리진 않았어...', photo:'휴. 고르기 힘들면 좋아하는 사진부터. 옆에서 봐줄게.', opening:'좋아하는 것부터 고르자. 내가 기다릴게.', description:'슬쩍 챙겨줘요', motion:'idle' },
  { score:90, home:'빨리빨리 다녀', photo:'휴. 네가 좋아하는 순간부터 고르자. 같이 보고 싶으니까.', opening:'이건 너랑 같이 보고 싶어. 먼저 골라줄래?', description:'당신 곁은 익숙해졌어요', motion:'idle' },
  { score:100, home:'혼자두고 어디다녀왔어', photo:'휴. 네가 좋아하는 순간부터 고르자. 같이 보고 싶으니까.', opening:'이건 너랑 같이 보고 싶어. 먼저 골라줄래?', description:'당신 곁은 익숙해졌어요', motion:'idle' },
]) test(`Gomi affection ${scenario.score} changes her Home, guide and book together`, async ({page}, info) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await installSnapshot(page,[{...companion('gomi',6,true),affection:scenario.score}]);
  await page.goto('/');
  await expect(page.locator('.homeSpeech')).toHaveText(scenario.home);
  const mascot=page.getByRole('button',{name:'고미에게 말 걸기'});
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-motion',scenario.motion);
  await mascot.locator('img').evaluate((image:HTMLImageElement)=>image.decode());
  await page.screenshot({path:`preview-results/gomi-affinity-${scenario.score}-${info.project.name}.png`});
  for(let touch=0;touch<3;touch++) {
    const previous=await page.locator('.homeSpeech').innerText();
    await mascot.click();
    await expect(page.locator('.homeSpeech')).not.toHaveText(previous);
    if(scenario.score<60) await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-motion','cynical');
  }
  await expect(page.locator('.homeCharacterMeta')).toContainText(`친밀도 ${scenario.score+1}`);
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  const guide=page.getByRole('dialog',{name:'버튼 도움말'});
  const tier=scenario.score>=90?4:scenario.score>=60?3:scenario.score>=30?2:scenario.score>=20?1:0;
  await expect(guide.locator('.helpVoice')).toHaveAttribute('data-affinity',String(tier));
  await expect(guide.locator('#helpInstruction')).toContainText('친밀도는 친구마다 하루 한 번');
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  // The Home companion menu is now a genuine help target between talking and the book.
  await expect(guide.getByRole('heading',{name:'친구의 AI 반응',exact:true})).toBeVisible();
  await guide.getByRole('button', {name:'다음',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'친구와 함께하기',exact:true})).toBeVisible();
  await expect(guide.locator('#helpInstruction')).toContainText('친밀도는 캐릭터에게 직접 말을 걸 때만');
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.getByRole('heading',{name:'친구들 보기',exact:true})).toBeVisible();
  await expect(guide.locator('#helpInstruction')).toContainText('친밀도는 오르지');
  await page.screenshot({path:`preview-results/gomi-guide-affinity-${scenario.score}-${info.project.name}.png`});
  await guide.getByRole('button',{name:'도움말 종료'}).click();
  await page.getByRole('button',{name:'친구들 보기'}).click();
  await expect(cardFor(page,'고미').locator('.characterDescription')).toContainText(scenario.description);
  await expect(cardFor(page,'고미').locator('.characterVisual')).toHaveAttribute('data-motion',scenario.motion);
});

for (const [before, after, tier, relation] of [[19,20,1,'아직 서먹한 사이'],[29,30,2,'서로 익숙한 사이'],[59,60,3,'가까운 사이'],[89,90,4,'아주 친밀한 사이']] as const) {
  test(`Gomi uses the saved relationship for AI and help when affection crosses ${after}`, async ({page}) => {
    await installSnapshot(page,[{...companion('gomi',6,true),affection:before}]);
    await page.addInitScript(()=>{
      const native=(window as any).__TAURI_INTERNALS__, original=native.invoke;
      (window as any).affinityPrompts=[];
      native.invoke=async(command:string,args:Record<string,unknown>={})=>{
        if(command==='chat_model_status')return {phase:'ready',supported:true,installed:true,model:'dialogue',downloaded:0,total:2497281120,message:'설치됨'};
        if(command==='generate_chat_reply'){(window as any).affinityPrompts.push(args.prompt);return '들었어. 지금은 조금 조용히 있고 싶네.';}
        return original(command,args);
      };
    });
    await page.goto('/');
    await page.getByRole('button',{name:'고미에게 말 걸기'}).click();
    await expect(page.locator('.homeCharacterMeta')).toContainText(`친밀도 ${after}`);
    await expect(page.locator('.homeSpeech')).toHaveAttribute('data-source','on-device');
    const prompts=await page.evaluate(()=>(window as any).affinityPrompts);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(`친밀도: ${after}`);
    expect(prompts[0]).toContain(`현재 관계: ${relation}`);
    await page.getByRole('button',{name:'현재 화면 도움말'}).click();
    await expect(page.getByRole('dialog',{name:'버튼 도움말'}).locator('.helpVoice')).toHaveAttribute('data-affinity',String(tier));
  });
}

test('another selected companion does not inherit Gomi dialogue or affection', async ({page}) => {
  await installSnapshot(page,[{...companion('gomi',6),affection:90},companion('potato',1,true)]);
  await page.goto('/');
  await page.getByRole('button',{name:'현재 화면 도움말'}).click();
  const guide = page.getByRole('dialog',{name:'버튼 도움말'});
  await expect(guide.locator('.characterVisual')).toHaveAttribute('data-character','potato');
  await expect(guide.locator('.characterHelpName')).toHaveText('감자싹');
  await expect(guide).not.toContainText('휴. 네가 좋아하는 순간부터 고르자. 같이 보고 싶으니까.');
});
