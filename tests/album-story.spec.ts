import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

function silentWav() {
  const data = Buffer.alloc(44 + 16000); data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24);
  data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
test.beforeEach(async ({ page }) => {
  await page.route('**/story-photo-*.jpg', route => route.fulfill({ contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#9fae90"/></svg>' }));
  await page.route('**/story-music.wav', route => route.fulfill({ contentType:'audio/wav', body:silentWav() }));
  await page.route('**/story-video.webm', route => route.fulfill({ contentType:'video/webm', body:Buffer.from(readFileSync('tests/fixtures/story-video.base64','utf8'), 'base64') }));
  await page.addInitScript(() => {
    const items = Array.from({ length:30 }, (_, i) => ({ id:i+1, file_path:`C:/story-photo-${i+1}.jpg`, file_type:'image', taken_at:'2026-05-15', width:600,height:900,size_bytes:100,title:`사진 ${i+1}`,rating:0,comment:'비가 오던 날',favorite:false }));
    const video = { ...items[0], id:31, file_path:'C:/story-video.webm', file_type:'video', title:'바다 영상' };
    const defaults = { title:'',body:'',display_duration:3,transition_type:'fade',comment_visible:true };
    const contents = [
      { ...defaults,id:'chapter',kind:'CHAPTER',media_id:null,title:'DAY 1',body:'제주로 가는 길' },
      { ...defaults,id:'photo',kind:'PHOTO',media_id:1 },
      { ...defaults,id:'video',kind:'VIDEO',media_id:31 },
      { ...defaults,id:'text',kind:'TEXT',media_id:null,title:'마지막 날',body:'가장 기억에 남는 순간' },
      ...items.slice(1).map(item => ({ ...defaults,id:`photo-${item.id}`,kind:'PHOTO',media_id:item.id })),
    ];
    const read = () => JSON.parse(localStorage.getItem('story-album-test') || 'null') || { id:1,title:'제주 스토리',description:'',cover_color:'#D8DDCB',created_at:'2026-05-15',items:[...items,video],contents,music_path:'C:/story-music.wav' };
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value:{ convertFileSrc:(path:string) => '/'+path.split('/').pop(), invoke:async (command:string,args:Record<string,any>) => {
      if (command === 'list_media') return [...items,video];
      if (command === 'list_albums') return [read()];
      if (command === 'plugin:dialog|open') return 'C:/story-music.wav';
      if (command === 'update_album') localStorage.setItem('story-album-test',JSON.stringify({ ...read(),contents:args.contents,music_path:args.musicPath }));
      return [];
    } } });
  });
});

test('story pauses timed pages, plays video to its end, limits preloading and returns to the book', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{ name:'내 앨범',exact:true }).click();
  await page.getByRole('button',{ name:'제주 스토리 앨범 열기',exact:true }).click();
  await page.getByRole('button',{ name:'스토리로 보기',exact:true }).click();
  const story = page.getByRole('dialog',{ name:'앨범 스토리',exact:true });
  await expect(story.getByRole('heading',{ name:'제주 스토리' })).toBeVisible();
  await story.getByRole('button',{ name:'재생',exact:true }).click();
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','CHAPTER');
  await story.getByRole('button',{ name:'일시정지',exact:true }).click();
  await page.clock.install();
  await page.clock.fastForward(8000);
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','CHAPTER');
  await story.getByRole('button',{ name:'다음 기록',exact:true }).click();
  await expect(story.getByAltText('사진 1',{ exact:true })).toBeVisible();
  await expect(story.locator('.storyCaption')).toContainText('비가 오던 날');
  await story.getByLabel('댓글·기록',{ exact:true }).uncheck();
  await expect(story.locator('.storyCaption')).not.toContainText('비가 오던 날');
  await story.getByRole('button',{ name:'음악 음소거',exact:true }).click();
  await expect(story.locator('.storyMusic')).toHaveJSProperty('muted',true);
  expect(await story.locator('img').count()).toBe(1);
  await story.getByRole('button',{ name:'다음 기록',exact:true }).click();
  await expect(story.locator('video')).toBeVisible();
  await page.clock.fastForward(30000);
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','VIDEO');
  await story.getByRole('button',{ name:'재생',exact:true }).click();
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','TEXT',{ timeout:10000 });
  await story.getByRole('button',{ name:'일시정지',exact:true }).click();
  await story.getByRole('button',{ name:'이전 기록',exact:true }).click();
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','VIDEO');
  await story.getByRole('button',{ name:'스토리 종료',exact:true }).click();
  await expect(page.getByRole('dialog',{ name:'앨범 전체창' })).toBeVisible();
  await expect(story).toBeHidden();
});

test('per-item story settings and album music survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{ name:'내 앨범',exact:true }).click();
  const edit = async () => {
    await page.getByRole('button',{ name:'제주 스토리 앨범 메뉴' }).click();
    await page.getByRole('button',{ name:'앨범 수정',exact:true }).click();
  };
  await edit();
  const editor = page.getByRole('dialog',{ name:'앨범 수정' });
  const row = editor.locator('.albumContentRow').nth(1);
  await row.getByText('스토리 설정',{ exact:true }).click();
  await row.getByLabel('표시 시간',{ exact:true }).selectOption('custom');
  await row.getByLabel('표시 시간(초)',{ exact:true }).fill('8.5');
  await row.getByLabel('전환 효과',{ exact:true }).selectOption('zoom');
  await row.getByLabel('댓글·기록 표시',{ exact:true }).uncheck();
  await editor.getByRole('button',{ name:'음악 제거',exact:true }).click();
  await editor.getByRole('button',{ name:'음악 선택',exact:true }).click();
  await editor.getByRole('button',{ name:'저장',exact:true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button',{ name:'내 앨범',exact:true }).click();
  await edit();
  await row.getByText('스토리 설정',{ exact:true }).click();
  await expect(row.getByLabel('표시 시간(초)',{ exact:true })).toHaveValue('8.5');
  await expect(row.getByLabel('전환 효과',{ exact:true })).toHaveValue('zoom');
  await expect(row.getByLabel('댓글·기록 표시',{ exact:true })).not.toBeChecked();
  await expect(editor.getByRole('region',{ name:'배경 음악',exact:true })).toContainText('story-music.wav');
});

test('timed chapters resume their remaining duration and photos advance after loading', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button',{ name:'내 앨범',exact:true }).click();
  await page.getByRole('button',{ name:'제주 스토리 앨범 열기',exact:true }).click();
  await page.getByRole('button',{ name:'스토리로 보기',exact:true }).click();
  const story = page.getByRole('dialog',{ name:'앨범 스토리',exact:true });
  await story.getByRole('button',{ name:'재생',exact:true }).click();
  await page.clock.fastForward(1000);
  await story.getByRole('button',{ name:'일시정지',exact:true }).click();
  await page.clock.fastForward(10000);
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','CHAPTER');
  await story.getByRole('button',{ name:'재생',exact:true }).click();
  await page.clock.fastForward(2200);
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','PHOTO');
  await expect(story.locator('.storyPhoto')).toHaveJSProperty('complete',true);
  await page.clock.fastForward(3200);
  await expect(story.locator('.storyFrame')).toHaveAttribute('data-kind','VIDEO');
});
