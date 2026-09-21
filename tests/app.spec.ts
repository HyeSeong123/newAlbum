import { expect, test } from "@playwright/test";

test("past memories count appears in the menu", async ({ page }) => {
  await page.addInitScript(() => {
    const today = new Date();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const media = [1, 2].map((id) => ({ id, file_path: `C:/memory-${id}.jpg`, file_type: "image", taken_at: `${today.getFullYear() - id}-${monthDay}`, width: 640, height: 480, duration: null, size_bytes: 1000, rating: 0, comment: "", favorite: false, metadata_status: "ready" }));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {
      convertFileSrc: () => "/favicon.svg",
      invoke: async (command: string) => command === "list_media" ? media : [],
    } });
  });
  await page.goto("/");
  const memoriesMenu = page.getByTitle("지난 추억");
  await expect(memoriesMenu.locator(".navCount")).toHaveText("2");
  await page.screenshot({ path: `test-results/memories-menu-count-${test.info().project.name}.png` });
  await memoriesMenu.click();
  await expect(page.locator(".memoryGrid button")).toHaveCount(2);
});

test("annual events use month and day and persist across years", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "달력" }).click();
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  const form = page.getByRole("dialog", { name: "일정 등록" });
  await form.getByLabel("매년 반복").check();
  await expect(form.locator('input[type="date"]')).toHaveCount(0);
  await form.getByLabel("행사 월").selectOption("01");
  await form.getByLabel("행사 일").selectOption("31");
  await form.getByLabel("행사 월").selectOption("02");
  await expect(form.getByLabel("행사 일")).toHaveValue("29");
  await form.getByLabel("행사 월").selectOption("09");
  await form.getByLabel("행사 일").selectOption("06");
  await form.getByPlaceholder("예: 엄마 생신, 가족 저녁 약속").fill("매년 생일");
  await page.screenshot({ path: `test-results/annual-event-${test.info().project.name}.png` });
  await form.getByRole("button", { name: "일정 추가" }).click();
  await page.reload();
  await page.getByRole("tab", { name: "달력" }).click();
  await page.locator(".monthPicker").getByLabel("연도").selectOption("2028");
  await page.locator(".monthPicker select").nth(1).selectOption("09");
  const eventCell = page.locator(".calendarGrid .hasEvent");
  const eventBadge = eventCell.locator(".dayEvents");
  await expect(eventBadge).toBeVisible();
  expect((await eventBadge.boundingBox())!.y).toBeLessThan((await eventCell.boundingBox())!.y + (await eventCell.boundingBox())!.height / 2);
  await page.screenshot({ path: `test-results/calendar-event-top-${test.info().project.name}.png`, fullPage: true });
  await page.locator(".calendarGrid button").filter({ has: page.locator(".dayNumber", { hasText: /^6$/ }) }).click();
  await expect(page.locator(".eventItem")).toContainText("매년 생일");
  await expect(page.locator(".eventItem")).toContainText("매년");
  await page.locator(".eventItem").getByLabel("D-day").uncheck();
  await page.getByTitle("닫기").click();
  await page.locator(".monthPicker").getByLabel("연도").selectOption("2029");
  await page.locator(".calendarGrid button").filter({ has: page.locator(".dayNumber", { hasText: /^6$/ }) }).click();
  await expect(page.locator(".eventItem").getByLabel("D-day")).not.toBeChecked();
  await page.getByTitle("일정 삭제").click();
  await expect(page.locator(".eventItem")).toHaveCount(0);
  await page.getByTitle("닫기").click();
  await page.locator(".monthPicker").getByLabel("연도").selectOption("2028");
  await expect(page.locator(".calendarGrid .hasEvent")).toHaveCount(0);
});

test("empty library flow works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "사진보기" })).toBeVisible();
  await expect(page.getByText("가져오기로 첫 사진과 영상을 담아보세요.")).toBeVisible();

  await page.getByRole("tab", { name: /달력/ }).click();
  await expect(page.locator(".calendarGrid")).toBeVisible();
  await page.locator(".calendarGrid button").first().click();
  await expect(page.getByRole("dialog", { name: /\d{4}-\d{2}-\d{2} 기록/ })).toBeVisible();
  await page.getByPlaceholder("어떤 날이었는지 적어두세요.").fill("조용히 기억해둘 날");
  await expect(page.getByPlaceholder("어떤 날이었는지 적어두세요.")).toHaveValue("조용히 기억해둘 날");
  await page.locator(".modalBackdrop").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: /\d{4}-\d{2}-\d{2} 기록/ })).toBeVisible();
  await page.getByTitle("닫기").click();
  await page.getByRole("button", { name: "일정 등록" }).click();
  await expect(page.getByRole("dialog", { name: "일정 등록" })).toBeVisible();
  await page.getByPlaceholder("예: 엄마 생신, 가족 저녁 약속").fill("엄마 생신");
  await page.getByRole("button", { name: "일정 추가" }).click();
  await expect(page.getByRole("dialog", { name: "일정 등록" })).toBeHidden();
  await page.locator(".calendarGrid button").first().click();
  await expect(page.getByText("엄마 생신")).toBeVisible();
  await expect(page.getByText(/생일 · D/)).toBeVisible();
  await page.getByTitle("닫기").click();

  await page.getByRole("tab", { name: /전체 앨범/ }).click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeVisible();
  await page.getByTitle("닫기").click();
  await expect(page.getByRole("tab", { name: "그리드" })).toHaveAttribute("aria-selected", "true");
});

test("gallery sorting, combined filters and persistent view counts work", async ({ page }) => {
  await page.addInitScript(() => {
    const media = [
      { id: 1, file_path: 'C:/z-last.jpg', file_type: 'image', taken_at: '2026-09-14', width: 640, height: 480, duration: null, size_bytes: 1000, rating: 5, comment: '', favorite: true, view_count: 1, metadata_status: 'ready' },
      { id: 2, file_path: 'C:/a-first.mp4', file_type: 'video', taken_at: '2024-01-02', width: 640, height: 480, duration: 10, size_bytes: 2000, rating: 2, comment: '', favorite: false, view_count: 8, metadata_status: 'ready' },
      { id: 3, file_path: 'C:/middle.mp3', file_type: 'audio', taken_at: '2025-05-03', width: null, height: null, duration: 60, size_bytes: 3000, rating: 0, comment: '', favorite: false, view_count: 3, metadata_status: 'ready' },
    ];
    localStorage.setItem('oraedameun.mediaComments', JSON.stringify({ 2: [
      { id: 'one', author: '가족', content: '첫 댓글', createdAt: '2026-09-14' },
      { id: 'two', author: '나', content: '둘째 댓글', createdAt: '2026-09-14' },
    ] }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: { id?: number }) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'increment_media_view') {
          const item = media.find((entry) => entry.id === args.id)!;
          item.view_count += 1;
          document.documentElement.dataset.viewedId = String(args.id);
          return item.view_count;
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.getByRole("button", { name: "모든 기록", exact: true }).click();
  const order = () => page.locator('.mediaTile').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-media-id')));
  await expect.poll(order).toEqual(['1', '3', '2']);
  await page.getByLabel('정렬 기준').selectOption('name');
  await expect.poll(order).toEqual(['2', '3', '1']);
  await page.getByLabel('정렬 기준').selectOption('comments');
  await expect.poll(order).toEqual(['2', '1', '3']);
  await page.getByLabel('정렬 기준').selectOption('rating');
  await expect.poll(order).toEqual(['1', '2', '3']);
  await page.getByLabel('정렬 기준').selectOption('views');
  await expect.poll(order).toEqual(['2', '3', '1']);

  await page.getByRole('button', { name: '필터', exact: true }).click();
  await page.getByLabel('미디어 종류').selectOption('video');
  await expect.poll(order).toEqual(['2']);
  await page.getByLabel('댓글 있는 사진만').check();
  await expect.poll(order).toEqual(['2']);
  await page.screenshot({ path: `test-results/gallery-sort-filter-${test.info().project.name}.png`, fullPage: true });
  await page.getByLabel('즐겨찾기만').check();
  await expect(page.getByText('조건에 맞는 사진과 영상이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(3);

  await page.locator('.mediaTile[data-media-id="1"]').click();
  await expect(page.getByText('2회', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-viewed-id', '1');
  await page.screenshot({ path: `test-results/gallery-view-count-${test.info().project.name}.png`, fullPage: true });
});

test("mobile nav is usable", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
    await page.getByRole("button", { name: /사진보기/ }).click();
    await page.getByRole("tab", { name: /전체 앨범/ }).click();
    await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeVisible();
  }
});

test("settings clear button is disabled when album is empty", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /설정/ }).click();
  await expect(page.getByText("앱에 등록된 0개의 항목만 지웁니다. 원본 파일은 그대로 남습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: /모두 비우기/ })).toBeDisabled();
});

test("clicking a media tile opens detail modal", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.locator(".galleryGrid .mediaTile").first().click();
  await expect(page.getByRole("dialog", { name: "사진 상세" })).toBeVisible();
  await page.locator(".modalBackdrop").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: "사진 상세" })).toBeVisible();
  await page.getByTitle("댓글", { exact: true }).click();
  await expect(page.getByPlaceholder("작성자")).toHaveValue("");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.getByTitle("확대 보기").click();
  const zoomViewer = page.getByRole("dialog", { name: "사진 확대 보기" });
  await expect(zoomViewer).toBeVisible();
  await expect(zoomViewer.locator(".detailBody, .viewerMeta, .commentBox")).toHaveCount(0);
  await zoomViewer.getByTitle("확대", { exact: true }).click();
  const zoomSlider = zoomViewer.getByRole("slider", { name: "확대 배율" });
  await expect(zoomSlider).toHaveValue("1.3");
  await zoomSlider.fill("2.5");
  await expect(zoomViewer.getByText("250%", { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/photo-zoom-${test.info().project.name}.png` });
  await zoomViewer.getByTitle("확대 보기 닫기").click();
  await expect(zoomViewer).toBeHidden();
  await page.getByTitle("5점").click();
  await page.getByPlaceholder("작성자").fill("나");
  await page.getByPlaceholder("내용 입력").fill("상세 모달에서 작성");
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.locator(".commentItem")).toContainText("나");
  await expect(page.locator(".commentItem")).toContainText("상세 모달에서 작성");
  await expect(page.locator("#detailTitle")).toHaveText("사진 기록");
  await page.getByTitle("댓글 수정").click();
  await page.locator(".commentEditForm").getByPlaceholder("작성자").fill("가족");
  await page.locator(".commentEditForm").getByPlaceholder("내용 입력").fill("수정된 댓글");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".commentItem")).toContainText("가족");
  await expect(page.locator(".commentItem")).toContainText("수정된 댓글");
  await page.getByTitle("댓글 삭제").click();
  await expect(page.locator(".commentItem")).toHaveCount(0);
  await expect(page.getByText("아직 남긴 댓글이 없습니다.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "사진 상세" })).toBeHidden();
});

test("selection mode supports selected actions", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.getByRole("button", { name: "사진 선택", exact: true }).click();
  await page.locator(".galleryGrid .mediaTile").nth(0).click();
  await page.locator(".galleryGrid .mediaTile").nth(1).click();
  await expect(page.locator(".galleryGrid .mediaTile").nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".galleryGrid .mediaTile").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /앨범 만들기/ })).toBeEnabled();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("원본 파일은 삭제되지 않습니다");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("2개 항목을 등록 목록에서 지웠습니다.")).toBeVisible();
  await expect(page.getByText("가져오기로 첫 사진과 영상을 담아보세요.")).toBeVisible();
});

test("created albums are visible from saved albums menu", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.getByRole("button", { name: "사진 선택", exact: true }).click();
  await page.locator(".galleryGrid .mediaTile").nth(0).click();
  await page.locator(".galleryGrid .mediaTile").nth(1).click();
  await page.getByRole("button", { name: /앨범 만들기/ }).click();
  const creator = page.getByRole("dialog", { name: "앨범 만들기", exact: true });
  await creator.getByLabel("제목", { exact: true }).fill("가족 여행");
  await creator.getByRole("button", { name: "차콜 색상", exact: true }).click();
  await page.screenshot({ path: `test-results/album-concept-create-${test.info().project.name}.png`, fullPage: true });
  await creator.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(creator).toBeHidden();
  await page.getByRole("button", { name: "내 앨범" }).click();
  await expect(page.locator("h1", { hasText: "내 앨범" })).toBeVisible();
  await page.getByRole("button", { name: "가족 여행 앨범 열기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeVisible();
  await expect(page.locator(".albumJournalHeader")).toContainText("가족 여행");
  await page.getByTitle("닫기").click();
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await page.getByRole("button", { name: "가족 여행 앨범 선택" }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "앨범 수정" });
  await editor.getByLabel("제목", { exact: true }).fill("변경 취소");
  await editor.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "가족 여행 앨범 선택" })).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await editor.getByLabel("제목", { exact: true }).fill("봄날의 가족");
  await editor.getByRole("button", { name: "네이비 색상", exact: true }).click();
  await editor.locator(".albumEditPhotos button").first().click();
  await page.screenshot({ path: `test-results/album-editor-${test.info().project.name}.png`, fullPage: true });
  await editor.getByRole("button", { name: /앨범에서 삭제/ }).click();
  await expect(editor.locator(".albumEditPhotos button")).toHaveCount(1);
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("button", { name: "봄날의 가족 앨범 선택" })).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await expect(editor.locator(".albumEditPhotos button")).toHaveCount(1);
  await expect(editor.getByRole("button", { name: "네이비 색상", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor.getByRole("button", { name: "취소", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.locator(".savedAlbumCard")).toHaveCount(0);
  await page.getByRole("button", { name: "사진보기", exact: true }).click();
  await expect(page.locator(".galleryGrid .mediaTile")).toHaveCount(2);
});

test("album view opens immersive reader", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.getByRole("tab", { name: /전체 앨범/ }).click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeVisible();
  await expect(page.locator(".albumJournal .albumPagerActions")).toContainText("펼침");
  await page.getByTitle("닫기").click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeHidden();
  await expect(page.getByRole("tab", { name: "그리드" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".galleryGrid .mediaTile")).toHaveCount(2);
  await page.getByRole("tab", { name: "전체 앨범" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "그리드" })).toHaveAttribute("aria-selected", "true");
});
