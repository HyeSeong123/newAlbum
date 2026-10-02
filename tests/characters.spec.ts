import { expect, test } from '@playwright/test';

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
  await expect(page.locator('.characterCard').filter({hasText:'은행싹'}).locator('img')).toHaveJSProperty('naturalWidth',220);
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
  await expect(potato.locator('img')).toHaveAttribute('src', '/brand/gamjassak-symbol.png');
  await expect(potato).toContainText('강원 추억 0장');
  await expect(sweet).toContainText('전남·광주 추억 0장');
  await sweet.getByRole('button', { name: '대표로 설정' }).click();
  await page.getByRole('button', { name: '감자싹 홈으로 이동' }).click();
  await expect(page.locator('.homeCharacterMeta')).toContainText('고구마싹');
  await expect(page.locator('.homeSpeech')).toContainText('형이랑');
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole('button', { name: '고구마싹에게 말 걸기' }).click();
  await expect(page.locator('.homeSpeech')).toContainText('처음부터');
  await page.getByRole('button', { name: '새싹 도감 보기' }).click();
  await potato.getByRole('button', { name: '대표로 설정' }).click();
  await page.getByRole('button',{name:'감자싹 홈으로 이동'}).click();
  await expect(page.getByRole('button',{name:'감자싹에게 말 걸기'})).toBeVisible();
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
