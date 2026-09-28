import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const media = [
      { id: 1, file_path: 'C:/before.jpg', taken_at: '2026-05-31' },
      { id: 2, file_path: 'C:/start.jpg', taken_at: '2026-06-01', favorite: true },
      { id: 3, file_path: 'C:/end.jpg', taken_at: '2026-06-30' },
      { id: 4, file_path: 'C:/after.jpg', taken_at: '2026-07-01' },
      { id: 5, file_path: 'C:/undated.jpg', taken_at: null },
    ].map(item => ({ file_type: 'image', width: 600, height: 400, size_bytes: 10, title: '', rating: 0,
      comment: '사진 댓글은 일기 페이지와 별개', favorite: false, ...item }));
    const entry = (id: string, kind: string, title: string, body = '', media_id: number | null = null) => ({
      id, kind, title, body, media_id, display_duration: 5, transition_type: 'fade', comment_visible: true,
    });
    const album = { id: 1, title: '여름 일기', description: '', cover_color: '#D8DDCB', created_at: '2026-07-01', items: media,
      contents: [entry('chapter', 'CHAPTER', '여행 시작'), entry('p1', 'PHOTO', '', '', 1),
        entry('d1', 'TEXT', '첫날의 일기', '바다를 만났다.\n오래 기억할 하루.'), entry('p2', 'PHOTO', '', '', 2),
        entry('d2', 'TEXT', '마지막 날', '다시 오고 싶은 곳.')] };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string) => command === 'list_media' ? structuredClone(media) : command === 'list_albums'
        ? [structuredClone(album), { ...album, id: 2, title: '사진만 있는 앨범', contents: undefined },
          { ...album, id: 3, title: '일기만 있는 앨범', items: [], contents: [album.contents[2]] }]
        : command === 'increment_media_view' ? 1 : [],
    } });
  });
  await page.goto('/');
});

test('date search crosses months, combines with text and favorites, validates and resets', async ({ page }) => {
  const start = page.getByLabel('촬영 시작일');
  const end = page.getByLabel('촬영 종료일');
  await start.fill('2026-06-01');
  await expect(page.locator('.mediaTile')).toHaveCount(3);
  await end.fill('2026-06-30');
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await expect(page.locator('.mediaTile[data-media-id="2"]')).toBeVisible();
  await expect(page.locator('.mediaTile[data-media-id="3"]')).toBeVisible();
  await page.getByRole('textbox', { name: '사진과 추억 검색' }).fill('start');
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await page.getByRole('button', { name: '검색 지우기' }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await page.getByRole('button', { name: '필터', exact: true }).click();
  await page.getByLabel('즐겨찾기만', { exact: true }).check();
  await expect(page.locator('.mediaTile')).toHaveCount(1);
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(start).toHaveValue('');
  await expect(end).toHaveValue('');
  await expect(page.locator('.mediaTile')).toHaveCount(5);
  await end.fill('2026-06-01');
  await expect(page.locator('.mediaTile')).toHaveCount(2);
  await start.fill('2026-07-01');
  await expect(page.getByRole('alert')).toContainText('종료일은 시작일과 같거나 이후');
  await expect(page.locator('.mediaTile')).toHaveCount(0);
  await page.getByRole('button', { name: '촬영 기간 초기화' }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('album list shows diaries separately and restores photos, chapters and book view', async ({ page }) => {
  await page.getByRole('button', { name: '내 앨범', exact: true }).click();
  await page.getByRole('button', { name: '여름 일기 앨범 열기', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '앨범 전체창' });
  await reader.getByTitle('사진 목록', { exact: true }).click();
  await expect(reader.locator('.albumPhotoList > button')).toHaveCount(2);
  await expect(reader.locator('.albumListWritten')).toHaveCount(3);
  await reader.getByRole('button', { name: '글·일기만 2', exact: true }).click();
  await expect(reader.locator('.albumPhotoList > button')).toHaveCount(0);
  await expect(reader.locator('.albumWrittenPage')).toHaveCount(2);
  await expect(reader.locator('.albumWrittenPage h3')).toHaveText(['첫날의 일기', '마지막 날']);
  await expect(reader.getByText('오래 기억할 하루.', { exact: false })).toBeVisible();
  await expect(reader.getByText('여행 시작', { exact: true })).toHaveCount(0);
  await reader.getByRole('button', { name: '전체 5', exact: true }).click();
  await reader.getByRole('button', { name: 'before.jpg 상세보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.keyboard.press('Escape');
  await reader.getByTitle('책으로 보기', { exact: true }).click();
  await expect(reader.locator('.albumSpread')).toBeVisible();
  await reader.getByTitle('닫기', { exact: true }).click();
  await page.getByRole('button', { name: '사진만 있는 앨범 앨범 열기', exact: true }).click();
  await reader.getByTitle('사진 목록', { exact: true }).click();
  await reader.getByRole('button', { name: '글·일기만 0', exact: true }).click();
  await expect(reader.getByText(/아직 작성된 글이 없어요/)).toBeVisible();
  await reader.getByTitle('닫기', { exact: true }).click();
  await page.getByRole('button', { name: '일기만 있는 앨범 앨범 열기', exact: true }).click();
  await reader.getByTitle('사진 목록', { exact: true }).click();
  await reader.getByRole('button', { name: '글·일기만 1', exact: true }).click();
  await expect(reader.locator('.albumWrittenPage')).toContainText('첫날의 일기');
  expect(await reader.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
