import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
      return { characters,events };
    } } });
  },{ initial,event });
}
const cardFor = (page:Page,name:string) => page.locator('.characterCard').filter({ has:page.getByRole('heading',{ name,exact:true }) });

test('the starter potato has a visible portrait and the book reveals no discovery or growth hints',async({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  const book=page.locator('.characterBook');
  const potato=cardFor(page,'감자싹');
  await expect(potato.locator('.characterCardArt img')).toHaveAttribute('src','/characters/potato/stage1-idle.png');
  await potato.locator('img').evaluate((img:HTMLImageElement)=>img.decode());
  const box=(await potato.locator('.characterVisual').boundingBox())!;
  expect(box.width).toBeGreaterThan(160);
  expect(box.height).toBeGreaterThan(160);
  await expect(page.locator('.characterCard.locked')).toHaveCount(14);
  await expect(book.locator('img')).toHaveCount(3);
  await expect(book.locator('details,progress,.characterStats,.characterPersonality,.characterRegion')).toHaveCount(0);
  await expect(book.getByRole('button',{name:/교감|말 걸기/})).toHaveCount(0);
  await expect(book).not.toContainText(/GPS|친밀도|성장 과정|완성하면|10장|30장|60장/);
  for(const def of definitions.filter(d => d.regionLabel)) await expect(book).not.toContainText(def.regionLabel);
  await page.screenshot({path:`test-results/character-book-${test.info().project.name}.png`,fullPage:true});
});

test('book viewing, portraits, rename and main selection never interact; only Home raises affection',async({page}) => {
  await installSnapshot(page,[companion('potato',1,true),companion('sweet-potato'),companion('orange',3)]);
  await page.goto('/');
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  const orange=page.locator('.characterCard').filter({has:page.locator('.characterVisual[data-character="orange"]')});
  await orange.locator('.characterCardArt').click();
  await orange.getByRole('button',{name:'이름 바꾸기'}).click();
  await orange.getByLabel('새싹 이름').fill('귤이');
  await orange.getByRole('button',{name:'저장'}).click();
  await orange.getByRole('button',{name:'대표로 설정'}).click();
  const interactions = () => page.evaluate(()=> (window as unknown as { sproutCommands:Array<{command:string;args:Record<string,unknown>}> }).sproutCommands.filter(c=>c.command === 'interact_character'));
  expect(await interactions()).toEqual([]);
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  await page.getByRole('button',{name:'귤이에게 말 걸기'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(page.locator('.homeMascot img')).toHaveAttribute('src',/happy.svg$/);
  expect((await interactions())[0].args).toEqual({ id:'orange',source:'home' });
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await cardFor(page,'귤이').locator('.characterCardArt').click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
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
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  for(const stage of [1,2,3,4,5,6]) {
    await page.evaluate(stage=>(window as unknown as {setSproutStage:(stage:number)=>void}).setSproutStage(stage),stage);
    await expect(cardFor(page,'감자싹').locator('.characterVisual')).toHaveAttribute('data-stage',String(stage));
    await expect(page.locator('.characterBook img')).toHaveCount(17);
    for(const def of definitions) {
      const image=cardFor(page,def.defaultName).locator('.characterCardArt img');
      await expect(image).toHaveAttribute('src',def.id === 'gomi' ? '/characters/gomi/cynical.png' : def.expressionAssetPaths?.idle ?? def.stageAssetPaths?.[stage-1] ?? `/characters/${def.id}/stage${def.fixedGrowthStage || stage}-idle.svg`);
      await image.evaluate((img:HTMLImageElement)=>img.decode());
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
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/potato/stage6-idle.png');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-reduced-motion','true');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('img')).toHaveAttribute('src','/characters/potato/stage6-idle.png');
  await expect(mascot.locator('.characterHeart')).toHaveCount(0);
  await expect(mascot.locator('img')).toHaveAttribute('data-expression','idle',{timeout:2500});
});

test('Gomi starts as an adult main; help and book never award affection and home changes her expression', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const mascot = page.getByRole('button', {name:'고미에게 말 걸기'});
  await expect(mascot.locator('img')).toHaveAttribute('src', '/characters/gomi/cynical.png');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-stage', '6');
  await page.getByRole('button', {name:'고미 도움말 열기'}).click();
  const guide = page.getByRole('dialog', {name:'고미 도움말'});
  await guide.getByRole('button', {name:'친구들', exact:true}).click();
  await expect(guide).toContainText('친밀도만 쌓을 수 있어요');
  await guide.getByRole('button', {name:'다음', exact:true}).click();
  await guide.getByRole('button', {name:'새싹 도감 열기'}).click();
  await expect(cardFor(page,'고미')).toBeVisible();
  await expect(cardFor(page,'고미').locator('.characterVisual')).toHaveAttribute('data-stage','6');
  await page.getByRole('button', {name:'감자싹 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 0');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('img')).toHaveAttribute('src', '/characters/gomi/cynical.png');
  await mascot.click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 1');
  await expect(mascot.locator('.characterVisual')).toHaveAttribute('data-stage', '6');
  await page.screenshot({path:`preview-results/gomi-home-${test.info().project.name}.png`,fullPage:true});
});

test('Gomi help follows the current screen, supports keyboard focus and opens the import flow', async ({page}) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  const opener = page.getByRole('button', {name:'고미 도움말 열기'});
  await expect(opener.locator('img')).toHaveAttribute('src','/characters/gomi/cynical.png');
  await opener.locator('img').evaluate((image:HTMLImageElement)=>image.decode());
  await opener.click();
  const guide = page.getByRole('dialog',{name:'고미 도움말'});
  await expect(guide.getByRole('button',{name:'인물 등록',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(guide).toContainText('사진 속 얼굴부터 찾자');
  await page.keyboard.press('Shift+Tab');
  await expect(guide.getByRole('button',{name:'다음',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(guide.getByRole('button',{name:'도움말 닫기'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await guide.getByRole('button',{name:'반려동물',exact:true}).click();
  await guide.getByRole('button',{name:'사람과 반려동물 열기'}).click();
  await expect(page.getByRole('tab',{name:'반려동물',exact:true})).toHaveAttribute('aria-selected','true');
  await opener.click();
  await expect(guide.getByRole('button',{name:'반려동물',exact:true})).toHaveAttribute('aria-pressed','true');
  await guide.getByRole('button',{name:'사진 등록',exact:true}).click();
  await page.screenshot({path:`preview-results/gomi-guide-${test.info().project.name}.png`});
  const box = (await guide.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await guide.getByRole('button',{name:'사진 등록 시작하기'}).click();
  await expect(page.getByRole('dialog',{name:'사진·영상 가져오기'})).toBeVisible();
});

test('Gomi tutorial navigation fits a short narrow phone with larger text', async ({page, isMobile}) => {
  test.skip(!isMobile, 'Phone geometry.');
  await page.setViewportSize({width:320,height:480});
  await page.goto('/');
  await page.getByRole('button',{name:'크게 보기',exact:true}).click();
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  const guide = page.getByRole('dialog',{name:'고미 도움말'});
  await guide.getByRole('button',{name:'인물 등록',exact:true}).click();
  const box = (await guide.boundingBox())!;
  const next = (await guide.getByRole('button',{name:'다음',exact:true}).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(480);
  expect(next.y+next.height).toBeLessThanOrEqual(480);
  expect(await guide.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide).toContainText('누구인지 확인하고 이름을 붙여');
  await page.screenshot({path:'preview-results/gomi-guide-short-phone.png'});
});

test('Gomi help remains available when another character is selected as main', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await cardFor(page,'감자싹').getByRole('button',{name:'대표로 설정'}).click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
  await expect(page.getByRole('button',{name:'감자싹에게 말 걸기'})).toBeVisible();
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  await expect(page.getByRole('dialog',{name:'고미 도움말'}).locator('.characterVisual')).toHaveAttribute('data-character','gomi');
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
  await expect(page.locator('#homeMessage')).toHaveText('뭐. 자잖아.');
  await page.clock.fastForward(1_800);
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-peek`);
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-angry`);
  await expect(visual).toHaveAttribute('data-expression','angry');
  await expect(mascot.locator('img')).toHaveAttribute('src',`/characters/gomi/${scenario.pose}-angry.png`);
  await expect(page.locator('#homeMessage')).toHaveText('그만. 건들지 마.');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 21');
  await expect(visual).toHaveAttribute('data-stage','6');
  await page.screenshot({path:`preview-results/gomi-${scenario.pose}-angry-${test.info().project.name}.png`});
  await page.clock.fastForward(2_600);
  await expect(visual).toHaveAttribute('data-motion',scenario.pose);
  await page.clock.fastForward(10_001);
  await mascot.click();
  await expect(visual).toHaveAttribute('data-motion',`${scenario.pose}-peek`);
  await expect(page.locator('#homeMessage')).toHaveText('뭐. 자잖아.');
  await expect(page.locator('.homeCharacterMeta')).toContainText('친밀도 21');
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
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
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
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  await page.clock.fastForward(120_000);
  await page.getByRole('button',{name:'도움말 닫기'}).click();
  await expect(visual).toHaveAttribute('data-motion','sleep-warm');
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
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
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  await expect(page.getByRole('dialog',{name:'고미 도움말'}).locator('.characterVisual')).toHaveAttribute('data-motion','cynical');
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
  { score:0, home:'…', photo:'…휴. 사진은 직접 골라.', description:'못 들은 척', motion:'cynical' },
  { score:20, home:'뭐.', photo:'사진? 가져오기 눌러. 끝.', description:'반가운 기색은 없어요', motion:'cynical' },
  { score:30, home:'휴. 또 왜.', photo:'휴. 마음에 드는 거부터 골라. 전부 넣을 필요 없잖아.', description:'이런 것도 말해야 해?', motion:'cynical' },
  { score:60, home:'휴. 왔네. 무슨 일이야.', photo:'휴. 고르기 힘들면 좋아하는 사진부터. 옆에서 봐줄게.', description:'슬쩍 챙겨줘요', motion:'idle' },
  { score:90, home:'휴. 너니까 해 주는 거야.', photo:'휴. 네가 좋아하는 순간부터 고르자. 같이 보고 싶으니까.', description:'당신 곁은 익숙해졌어요', motion:'idle' },
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
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  const guide=page.getByRole('dialog',{name:'고미 도움말'});
  await expect(guide.locator('.gomiGuideSpeech')).toHaveText(scenario.photo);
  await expect(guide.locator('.gomiGuideStep')).toContainText('파일 선택');
  await guide.getByRole('button',{name:'다음',exact:true}).click();
  await expect(guide.locator('.gomiGuideStep')).toContainText('위치 태그');
  await guide.getByRole('button',{name:'친구들',exact:true}).click();
  await expect(guide.locator('.gomiGuideStep')).toContainText('친밀도만 쌓을 수 있어요');
  await page.screenshot({path:`preview-results/gomi-guide-affinity-${scenario.score}-${info.project.name}.png`});
  await guide.getByRole('button',{name:'도움말 닫기'}).click();
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await expect(cardFor(page,'고미').locator('.characterDescription')).toContainText(scenario.description);
  await expect(cardFor(page,'고미').locator('.characterVisual')).toHaveAttribute('data-motion',scenario.motion);
});

for (const [before, after, line] of [[19,20,'뭐.'],[29,30,'휴. 또 왜.'],[59,60,'휴. 왔네. 무슨 일이야.'],[89,90,'휴. 너니까 해 주는 거야.']] as const) {
  test(`Gomi immediately replaces stale speech when affection crosses ${after}`, async ({page}) => {
    await installSnapshot(page,[{...companion('gomi',6,true),affection:before}]);
    await page.goto('/');
    await page.getByRole('button',{name:'고미에게 말 걸기'}).click();
    await expect(page.locator('.homeCharacterMeta')).toContainText(`친밀도 ${after}`);
    await expect(page.locator('.homeSpeech')).toHaveText(line);
    await page.getByRole('button',{name:'고미 도움말 열기'}).click();
    await expect(page.getByRole('dialog',{name:'고미 도움말'}).locator('.gomiGuideSpeech')).not.toBeEmpty();
  });
}

test('Gomi help uses her own affection when another companion is main', async ({page}) => {
  await installSnapshot(page,[{...companion('gomi',6),affection:90},companion('potato',1,true)]);
  await page.goto('/');
  await page.getByRole('button',{name:'고미 도움말 열기'}).click();
  await expect(page.getByRole('dialog',{name:'고미 도움말'}).locator('.gomiGuideSpeech')).toHaveText('휴. 네가 좋아하는 순간부터 고르자. 같이 보고 싶으니까.');
});
