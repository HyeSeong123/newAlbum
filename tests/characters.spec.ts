import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json','utf8')) as Array<{ id:string; defaultName:string; regionLabel:string; maxStage:number; stageAssetPaths?:string[] }>;

type Companion = { id:string; customName:string|null; growthStage:number; regionPhotoCount:number; growthPhotoCount:number; affection:number; isMain:boolean; unlockedAt:string; createdAt:string; updatedAt:string };
const companion = (id:string,stage=1,isMain=false):Companion => ({ id,customName:null,growthStage:stage,regionPhotoCount:0,growthPhotoCount:0,affection:0,isMain,unlockedAt:'2026-10-03',createdAt:'2026-10-03',updatedAt:'2026-10-03' });
async function installSnapshot(page:Page,initial:Companion[],event?:{ id:number; characterId:string; kind:string; stage:number }) {
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
  await expect(book.locator('img')).toHaveCount(2);
  await expect(book.locator('details,progress,.characterStats,.characterPersonality,.characterRegion')).toHaveCount(0);
  await expect(book.getByRole('button',{name:/교감|말 걸기/})).toHaveCount(0);
  await expect(book).not.toContainText(/GPS|친밀도|성장 과정|완성하면|10장|30장|60장/);
  for(const def of definitions) await expect(book).not.toContainText(def.regionLabel);
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
    await expect(page.locator('.characterCardArt .characterVisual').first()).toHaveAttribute('data-stage',String(stage));
    await expect(page.locator('.characterBook img')).toHaveCount(16);
    for(const def of definitions) {
      const image=cardFor(page,def.defaultName).locator('.characterCardArt img');
      await expect(image).toHaveAttribute('src',def.stageAssetPaths?.[stage-1] ?? `/characters/${def.id}/stage${stage}-idle.svg`);
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
