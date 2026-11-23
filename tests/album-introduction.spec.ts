import { expect, test, type Page } from '@playwright/test';

async function seedAlbum(page: Page, { representative = true, withStory = true } = {}) {
  await page.route('**/intro-photo.jpg', route => route.fulfill({
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#a1b29d"/></svg>',
  }));
  await page.addInitScript(({ representative, withStory }) => {
    const photo = { id:1, file_path:'/private/intro-photo.jpg', file_type:'image', title:'첫 바다', comment:'바람이 차가웠다',
      taken_at:'2026-05-15', created_at:'2026-05-15', latitude:33.51234, longitude:126.51234,
      width:640, height:400, size_bytes:100, rating:0, favorite:false };
    const entry = (id:string, kind:string, title:string, body:string, media_id?:number) => ({
      id, kind, title, body, media_id, display_duration:5, transition_type:'fade', comment_visible:true,
    });
    const album = { id:7, title:'제주 여행', description:withStory ? '친구와 함께한 주말' : '', created_at:'2026-05-16', cover_color:'#D8DDCB',
      items:withStory ? [photo] : [], contents:withStory ? [entry('photo-1','PHOTO','','',1), entry('c','CHAPTER','둘째 날','이른 아침 산책'),
        entry('t','TEXT','작은 편지','오래 기억할게\n'.repeat(35))] : [] };
    const diaries = withStory ? [{ id:2, date:'2026-05-16', title:'연결 일기만의 제목', body:'미리보기와 분리된 본문',
      mood:'기쁨', weather:'맑음', album_id:album.id, photos:[] }] : [];
    const commands: string[] = [];
    Object.defineProperty(window, 'albumIntroCommands', { value:commands });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value:{
      convertFileSrc:(path:string) => '/' + path.split('/').at(-1),
      invoke:async (command:string) => {
        commands.push(command);
        if(command==='list_albums') return [structuredClone(album)];
        if(command==='list_media') return structuredClone(album.items);
        if(command==='list_diary') return structuredClone(diaries);
        if(command==='check_android_location_setup') return {locationEnabled:true,photoLocationGranted:true};
        if(command==='sync_characters') return { characters:representative ? [{ id:'apple', customName:'밤도깨비', affection:14, growthStage:6, isMain:true }] : [], events:[] };
        return [];
      },
    }});
  }, { representative, withStory });
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.getByRole('button', {name:'내 앨범',exact:true}).click();
  await page.getByRole('button', {name:'제주 여행 앨범 열기',exact:true}).click();
  return page.getByRole('dialog', {name:'앨범 전체창',exact:true});
}

test('album introduction shows saved text, scrolls, and closes back to the same reading page', async ({page,isMobile}) => {
  await page.setViewportSize({width:320,height:620});
  const reader = await seedAlbum(page);
  await reader.getByLabel('앨범 책장 이동').fill('2');
  await expect(reader.locator('.albumWrittenPage')).toContainText('둘째 날');
  const opener = reader.getByRole('button', {name:'밤도깨비에게 소개하기',exact:true});
  await expect(opener).toBeVisible();
  await expect(opener).toHaveText('밤도깨비에게 소개하기');
  expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await reader.locator('.albumJournalHeader').screenshot({path:`preview-results/audit/album-introduction-header-${test.info().project.name}.png`});
  if (isMobile) await opener.tap();
  else await opener.click();
  const dialog = page.getByRole('dialog', {name:'밤도깨비에게 앨범 소개하기',exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeInViewport({ratio:1});
  const preview = dialog.getByLabel('소개할 앨범 내용');
  await expect(preview.locator('p')).toHaveText([
    '앨범 제목: 제주 여행', '앨범 설명: 친구와 함께한 주말', '사진 제목: 첫 바다', '사진 설명: 바람이 차가웠다',
    '챕터 제목: 둘째 날', '챕터 내용: 이른 아침 산책', '편지 제목: 작은 편지', /^편지 내용: 오래 기억할게/,
  ]);
  await expect(dialog).not.toContainText(/intro-photo\.jpg|33\.51234|연결 일기만의 제목|미리보기와 분리된 본문/);
  expect(await preview.evaluate(el => {el.scrollTop=el.scrollHeight;return el.scrollTop;})).toBeGreaterThan(0);
  const close = dialog.getByRole('button',{name:'닫기',exact:true});
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport({ratio:1});
  expect(await close.evaluate(button => {
    const {left,right,bottom} = button.getBoundingClientRect();
    return [[left+3,bottom-3],[right-3,bottom-3]].every(([x,y]) => button.contains(document.elementFromPoint(x,y)));
  })).toBe(true);
  await dialog.screenshot({path:`preview-results/audit/album-introduction-modal-${test.info().project.name}.png`});
  if (isMobile) expect(await page.evaluate(() => window.__gamjassakBack?.())).toBe(true);
  else await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(reader.locator('.albumWrittenPage')).toContainText('둘째 날');
  await opener.click();
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  const commands = await page.evaluate(() => (window as Window & {albumIntroCommands?: string[]}).albumIntroCommands ?? []);
  expect(commands).toContain('list_diary');
  expect(commands.filter(command => /^(save_|update_|interact_|generate_)/.test(command))).toEqual([]);
});

test('album introduction handles an album without written details and a missing representative', async ({page}) => {
  const reader = await seedAlbum(page, {representative:false,withStory:false});
  await reader.getByRole('button',{name:'대표 친구에게 소개하기',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'앨범 소개 준비',exact:true});
  await expect(dialog).toContainText('대표 친구를 선택');
  await expect(dialog.getByRole('region',{name:'소개할 앨범 내용'})).toContainText('앨범 제목: 제주 여행');
  await expect(dialog).toContainText('사진 설명이나 챕터, 편지');
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  await expect(reader).toBeVisible();
});
