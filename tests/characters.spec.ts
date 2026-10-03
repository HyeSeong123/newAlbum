import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json','utf8')) as Array<{
  id:string; defaultName:string; personality:{ archetype:string }; growthStages:Array<{ name:string }>;
}>;

test('GPS discovery opens the book, names a companion, changes the main and returns to idle', async ({ page }) => {
  await page.addInitScript(() => {
    let characters: Array<{ id:string; customName:string|null; growthStage:number; regionPhotoCount:number; affection:number; isMain:boolean; unlockedAt:string; createdAt:string; updatedAt:string }> = [
      { id:'potato', customName:null, growthStage:1, regionPhotoCount:1, affection:1, isMain:true, unlockedAt:'2026-10-02', createdAt:'2026-10-02', updatedAt:'2026-10-02' },
      { id:'sweet-potato', customName:null, growthStage:1, regionPhotoCount:0, affection:0, isMain:false, unlockedAt:'2026-10-02', createdAt:'2026-10-02', updatedAt:'2026-10-02' },
      { id:'orange', customName:null, growthStage:2, regionPhotoCount:12, affection:12, isMain:false, unlockedAt:'2026-10-02', createdAt:'2026-10-02', updatedAt:'2026-10-02' },
      { id:'ginkgo', customName:null, growthStage:1, regionPhotoCount:1, affection:1, isMain:false, unlockedAt:'2026-10-02', createdAt:'2026-10-02', updatedAt:'2026-10-02' },
    ];
    let events = [{ id:1, characterId:'orange', kind:'unlock', stage:2 }];
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value: { convertFileSrc:() => '/favicon.png', invoke: async (command:string,args:Record<string,unknown>) => {
      if(command === 'list_media' || command === 'list_albums' || command === 'list_diary') return [];
      if(command === 'dismiss_character_event') events = events.filter(event => event.id !== args.eventId);
      if(command === 'rename_character') characters = characters.map(c => c.id === args.id ? {...c,customName:args.name as string} : c);
      if(command === 'set_main_character') characters = characters.map(c => ({...c,isMain:c.id === args.id}));
      if(command === 'interact_character') characters = characters.map(c => c.id === args.id ? {...c,affection:c.affection+1} : c);
      return { characters,events };
    } } });
  });
  await page.goto('/');
  await expect(page.getByRole('dialog',{name:'새로운 새싹을 발견했어요!'})).toBeVisible();
  await page.getByRole('button',{name:'만나보기'}).click();
  await expect(page.getByRole('heading',{name:'새싹 도감',exact:true})).toBeVisible();
  await expect(page.locator('.characterCard.locked')).toHaveCount(12);
  await expect(page.locator('.characterCard')).toHaveCount(16);
  const first = (await page.locator('.characterCard').nth(0).boundingBox())!;
  const second = (await page.locator('.characterCard').nth(1).boundingBox())!;
  const fourth = (await page.locator('.characterCard').nth(3).boundingBox())!;
  if (test.info().project.name === 'desktop') {
    expect(Math.abs(first.y - fourth.y)).toBeLessThan(2);
  } else {
    expect(second.y).toBeGreaterThan(first.y + first.height - 2);
  }
  await page.screenshot({path:`test-results/character-book-${test.info().project.name}.png`});
  await expect(page.locator('.characterCard').filter({hasText:'은행싹'}).locator('.characterCardArt img')).toHaveJSProperty('naturalWidth',220);
  const orange = page.locator('.characterCard').filter({has:page.locator('.characterRegion',{hasText:'제주'})});
  await expect(orange).toContainText('추억 12장');
  await orange.getByRole('button',{name:'이름 바꾸기'}).click();
  await orange.getByLabel('새싹 이름').fill('귤이');
  await orange.getByRole('button',{name:'저장'}).click();
  await expect(orange.getByRole('heading',{name:'귤이'})).toBeVisible();
  await orange.getByRole('button',{name:'대표로 설정'}).click();
  await expect(orange).toContainText('대표 새싹');
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('귤이');
  const mascot = page.getByRole('button',{name:'귤이에게 말 걸기'});
  await mascot.click();
  await expect(mascot.locator('img')).toHaveAttribute('src',/happy\.svg$/);
  await expect(mascot.locator('img')).toHaveAttribute('src',/idle\.svg$/,{timeout:2500});
});

test('without GPS photos the brothers guide and encourage while regional friends stay locked', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'새싹 도감 보기'}).click();
  await expect(page.locator('.characterCard.locked')).toHaveCount(14);
  await expect(page.getByText('제주에서 찍은 GPS 사진을 등록하면 만날 수 있어요.')).toBeVisible();
  const potato = page.locator('.characterCard').filter({ has: page.getByRole('heading', { name: '감자싹', exact: true }) });
  const sweet = page.locator('.characterCard').filter({ has: page.getByRole('heading', { name: '고구마싹', exact: true }) });
  await expect(potato).toContainText('처음부터 함께 · 동생');
  await expect(sweet).toContainText('처음부터 함께 · 형');
  await expect(potato.locator('.characterCardArt img')).toHaveAttribute('src', '/brand/gamjassak-symbol.png');
  await expect(potato).toContainText('강원 추억 0장');
  await expect(sweet).toContainText('전남·광주 추억 0장');
  await expect(sweet).toContainText('감자싹을 완성하면 키울 수 있어요');
  await sweet.getByText('고유 성장 과정 보기', { exact: true }).click();
  await expect(sweet.locator('.characterGrowthJourney ol li')).toHaveCount(4);
  await expect(sweet.locator('.characterGrowthJourney ol')).toContainText('하트잎 고구마싹');
  await expect(sweet.locator('.characterGrowthJourney ol')).toContainText('든든한 고구마싹');
  await sweet.getByRole('button', { name: '대표로 설정' }).click();
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('고구마싹');
  await expect(page.locator('.homeSpeech')).toContainText('형이랑');
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole('button', { name: '고구마싹에게 말 걸기' }).click();
  await expect(page.locator('.homeSpeech')).toContainText('감자가 완성되면');
  await page.getByRole('button', { name: '새싹 도감 보기' }).click();
  await potato.getByRole('button', { name: '대표로 설정' }).click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
  await expect(page.getByRole('button',{name:'감자싹에게 말 걸기'})).toBeVisible();
});

test('potato completion starts sweet potato growth with newly collected photos', async ({ page }) => {
  await page.addInitScript(() => {
    const created = { customName:null, affection:0, unlockedAt:'2026-10-03', createdAt:'2026-10-03', updatedAt:'2026-10-03' };
    let characters = [
      { ...created, id:'potato', growthStage:3, regionPhotoCount:59, growthPhotoCount:59, isMain:true },
      { ...created, id:'sweet-potato', growthStage:1, regionPhotoCount:100, growthPhotoCount:0, isMain:false },
    ];
    let events: Array<{ id:number; characterId:string; kind:string; stage:number }> = [];
    Object.assign(window, { advanceSprouts: (photos: number) => {
      characters = characters.map(c => c.id === 'potato' ? { ...c, growthStage:4, regionPhotoCount:60, growthPhotoCount:60 }
        : { ...c, regionPhotoCount:100+photos, growthPhotoCount:photos, growthStage:photos >= 10 ? 2 : 1 });
      if (photos === 0) events = [{ id:1, characterId:'potato', kind:'grow', stage:4 }];
      window.dispatchEvent(new Event('focus'));
    } });
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value: { convertFileSrc:() => '/favicon.png', invoke: async (command:string,args:Record<string,unknown>) => {
      if(command === 'list_media' || command === 'list_albums' || command === 'list_diary') return [];
      if(command === 'dismiss_character_event') events = events.filter(event => event.id !== args.eventId);
      return { characters,events };
    } } });
  });
  await page.goto('/');
  await page.getByRole('button',{ name:'새싹 도감 보기' }).click();
  const sweet = page.locator('.characterCard').filter({ has:page.getByRole('heading',{ name:'고구마싹',exact:true }) });
  await expect(sweet).toContainText('감자싹을 완성하면 키울 수 있어요');
  await page.evaluate(() => (window as unknown as { advanceSprouts:(count:number) => void }).advanceSprouts(0));
  const completion = page.getByRole('dialog',{ name:'감자싹을 완성했어요!' });
  await expect(completion).toContainText('고구마 형을 키울 수 있어요');
  await completion.getByRole('button',{ name:'나중에 보기' }).click();
  await expect(sweet).toContainText('전남·광주 GPS 사진 10장');
  await expect(sweet.locator('progress')).toHaveAttribute('value','0');
  await expect(sweet).toContainText('추억 100장');
  await page.evaluate(() => (window as unknown as { advanceSprouts:(count:number) => void }).advanceSprouts(10));
  await expect(sweet).toContainText('성장 1 · 줄기 뻗는 고구마싹');
  await expect(sweet).toContainText('전남·광주 GPS 사진 20장');
  await expect(sweet.locator('progress')).toHaveAttribute('value','10');
});

test('all sixteen companions show their own four forms and personalities', async ({ page }) => {
  await page.addInitScript((ids) => {
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value: { convertFileSrc:() => '/favicon.png', invoke: async (command:string) => {
      if(command === 'list_media' || command === 'list_albums' || command === 'list_diary') return [];
      return { characters:ids.map(id => ({ id,customName:null,growthStage:4,regionPhotoCount:60,growthPhotoCount:60,affection:0,isMain:id === 'potato',unlockedAt:'2026-10-03',createdAt:'2026-10-03',updatedAt:'2026-10-03' })),events:[] };
    } } });
  }, definitions.map(definition => definition.id));
  await page.goto('/');
  await page.getByRole('button',{ name:'새싹 도감 보기' }).click();
  await expect(page.locator('.characterCard.locked')).toHaveCount(0);
  await page.locator('.characterGrowthJourney').evaluateAll(details => details.forEach(detail => { (detail as HTMLDetailsElement).open = true; }));
  for (const definition of definitions) {
    const card = page.locator('.characterCard').filter({ has:page.getByRole('heading',{ name:definition.defaultName,exact:true }) });
    await expect(card.locator('.characterPersonality')).toContainText(definition.personality.archetype);
    const journey = card.locator('.characterGrowthJourney ol');
    await expect(journey.locator('li')).toHaveCount(4);
    await expect(journey.locator('li[aria-current="step"]')).toContainText(definition.growthStages[3].name);
    for (const stage of definition.growthStages) await expect(journey).toContainText(stage.name);
  }
  await page.locator('.characterBook img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (test.info().project.name === 'desktop') {
    await page.screenshot({ path:'test-results/all-sprout-growth-desktop.png',fullPage:true });
    for (let row = 0; row < 4; row++) {
      const first = page.locator('.characterCard').nth(row*4);
      await first.scrollIntoViewIfNeeded();
      const box = (await first.boundingBox())!;
      const grid = (await page.locator('.characterGrid').boundingBox())!;
      const y = Math.max(0,box.y);
      await page.screenshot({ path:`test-results/sprout-growth-row-${row+1}.png`, clip:{ x:box.x,y,width:grid.width,height:Math.min(box.height,1000-y) } });
    }
  }
  const apple = page.locator('.characterCard').filter({ has:page.getByRole('heading',{ name:'사과싹',exact:true }) });
  await apple.getByRole('button',{ name:'사과싹과 교감하기' }).click();
  await expect(apple.locator('.characterCardArt img')).toHaveClass(/characterMotion--quiet-nod/);
  await expect(apple.locator('.characterDialogue')).toHaveCount(0);
  await expect(apple).toContainText('추억 60장');
  await expect(apple.getByRole('button',{ name:'이름 바꾸기' })).toBeVisible();
});

test('potato keeps the original artwork after growth and clicking', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.png',
      invoke: async (command: string) => command === 'sync_characters' || command === 'interact_character' ? {
        characters: [{ id: 'potato', customName: null, growthStage: 4, regionPhotoCount: 60, affection: 60, isMain: true,
          unlockedAt: '2026-10-02', createdAt: '2026-10-02', updatedAt: '2026-10-02' }], events: [],
      } : [],
    } });
  });
  await page.goto('/');
  const mascot = page.getByRole('button', { name: '감자싹에게 말 걸기' });
  await expect(mascot.locator('img')).toHaveAttribute('src', '/brand/gamjassak-symbol.png');
  await expect(mascot.locator('img')).toHaveAttribute('data-stage', '4');
  await mascot.click();
  await expect(mascot.locator('img')).toHaveAttribute('data-expression', 'happy');
  await expect(mascot.locator('img')).toHaveAttribute('src', '/brand/gamjassak-symbol.png');
  await expect(mascot.locator('img')).toHaveAttribute('data-expression', 'idle', { timeout: 2500 });
});
