import { toStep } from './fixtures/helpSpotlight';
import { expect, test } from '@playwright/test';
import { auditLibrary } from './audit-fixture';

for (const width of [320, 360, 393]) test(`menu keeps the full tab row at ${width}px`, async ({page,isMobile}) => {
  test.skip(!isMobile, 'Android phone geometry.');
  await page.setViewportSize({width,height:740});await auditLibrary(page);
  const nav=page.locator('.navList'),row=page.locator('.navScroll'),menu=page.getByRole('button',{name:'전체 메뉴',exact:true});
  await expect(menu).toBeVisible();
  const n=(await nav.boundingBox())!,r=(await row.boundingBox())!,m=(await menu.boundingBox())!;
  expect(n.width).toBeGreaterThanOrEqual(r.width-90);
  expect(m.y+m.height).toBeLessThanOrEqual(r.y+1);
  for(const name of ['홈','사진 기록','내 앨범'])await expect(nav.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await menu.click();await expect(page.locator('.actionMenuPanel').getByRole('button',{name:'설정',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(menu).toBeFocused();
});

test('home opens people and pets from the shortcut after diary',async({page,isMobile})=>{
  await auditLibrary(page);
  const shortcuts=page.getByRole('navigation',{name:'기록 바로가기'});
  await expect(shortcuts.getByRole('button')).toHaveCount(4);
  const people=shortcuts.getByRole('button',{name:'사람과 반려동물 열기',exact:true});
  await expect(shortcuts.getByRole('button').last()).toHaveText('사람과 반려동물');
  if(isMobile){const diary=(await shortcuts.getByRole('button',{name:'일기장 열기',exact:true}).boundingBox())!,p=(await people.boundingBox())!;expect(p.y).toBeGreaterThanOrEqual(diary.y+diary.height);}
  await people.click();await expect(page.locator('.peopleWorkspace')).toBeVisible();
});

test('screen help stays on the current feature until it is closed',async({page})=>{
  await auditLibrary(page);await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  const opener=page.getByRole('button',{name:'현재 화면 도움말'});
  await opener.click();const help=page.getByRole('dialog',{name:'버튼 도움말',exact:true});
  await expect(help.getByRole('heading',{name:'인물',exact:true})).toBeVisible();
  await help.getByRole('button',{name:'다음',exact:true}).click();
  await expect(help.getByRole('heading',{name:'반려동물',exact:true})).toBeVisible();
  await help.getByRole('button',{name:'도움말 종료',exact:true}).click();await expect(opener).toBeFocused();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();await opener.click();
  await expect(help.getByRole('heading',{name:'인물',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.petsView')).toBeVisible();
});

test('selection guidance opens on demand and Back preserves the selection',async({page,isMobile})=>{
  await auditLibrary(page);await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('button',{name:'가족 24장',exact:true}).click();await page.getByRole('button',{name:'선택',exact:true}).click();
  await page.locator('.personOriginal').first().click();const bar=page.locator('.entitySelectionBar');
  await expect(bar).toContainText('사진 1개 선택');await expect(page.getByText('이 인물과의 사진 연결만 변경합니다.',{exact:false})).toHaveCount(0);
  const opener=page.getByRole('button',{name:'현재 화면 도움말',exact:true});await opener.click();
  const help=page.getByRole('dialog',{name:'버튼 도움말',exact:true});await toStep(page,'전체 선택');await expect(help).toContainText('같은 사진의 다른 인물은 유지됩니다');
  await expect(help).not.toContainText('반려동물 사진 찾기');
  if(isMobile)await page.evaluate(()=>window.__gamjassakBack?.());else await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);await expect(opener).toBeFocused();await expect(bar).toContainText('사진 1개 선택');
});

test('photo connection help closes before the editor and keeps the name and photos',async({page})=>{
  await auditLibrary(page);await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('button',{name:'인물 추가',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'인물 추가',exact:true});await editor.getByLabel('등록할 이름').fill('가족 새 이름');
  await editor.locator('.entityPhotoChoice').first().click();await expect(editor.locator('.entityPhotoCount')).toHaveText('사진 1장 선택');
  await expect(editor.getByText('자동으로 감지하지 못한 사진도 직접 등록할 수 있어요.',{exact:false})).toHaveCount(0);
  const opener=page.getByRole('button',{name:'현재 화면 도움말',exact:true});await opener.click();
  await toStep(page,'사진 저장');await expect(page.getByRole('dialog',{name:'버튼 도움말',exact:true})).toContainText('자동으로 감지하지 못한 사진');
  await page.keyboard.press('Escape');await expect(editor).toBeVisible();await expect(editor.getByLabel('등록할 이름')).toHaveValue('가족 새 이름');
  await expect(editor.locator('.entityPhotoCount')).toHaveText('사진 1장 선택');await expect(opener).toBeFocused();
});

test('pet discovery keeps its action visible and moves the passive explanation into help',async({page})=>{
  await auditLibrary(page);await page.locator('.navList').getByRole('button',{name:'사람과 반려동물',exact:true}).click();
  await page.getByRole('tab',{name:'반려동물',exact:true}).click();await page.getByRole('button',{name:'보리 1장',exact:true}).click();
  await expect(page.getByRole('button',{name:'반려동물 사진 찾기',exact:true})).toBeVisible();
  await expect(page.getByText('보리의 다른 사진도 찾아보세요',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'현재 화면 도움말',exact:true}).click();await toStep(page,'반려동물 사진 찾기');
  await expect(page.getByRole('dialog',{name:'버튼 도움말',exact:true})).toContainText('연결한 사진과 비교');
  await page.keyboard.press('Escape');await expect(page.locator('.petsView h2')).toHaveText('보리');
});
