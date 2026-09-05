import { expect, test } from "@playwright/test";

test("empty library flow works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "사진보기" })).toBeVisible();
  await expect(page.getByText("아직 담긴 사진과 영상이 없습니다.")).toBeVisible();

  await page.getByRole("tab", { name: /달력보기/ }).click();
  await expect(page.getByText("달력에 표시할 사진과 영상이 아직 없습니다.")).toBeVisible();

  await page.getByRole("tab", { name: /앨범보기/ }).click();
  await expect(page.getByRole("heading", { name: "나의 앨범" })).toBeVisible();
  await expect(page.getByText("앨범에 꽂아둘 사진과 영상이 아직 없습니다.")).toBeVisible();
});

test("mobile nav is usable", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
    await page.getByRole("button", { name: /사진보기/ }).click();
    await page.getByRole("tab", { name: /앨범보기/ }).click();
    await expect(page.getByRole("heading", { name: "나의 앨범" })).toBeVisible();
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
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/test-photo.jpg");

  await page.getByRole("button", { name: /test-photo.jpg/ }).click();
  await expect(page.getByRole("dialog", { name: "test-photo.jpg" })).toBeVisible();
  await page.getByTitle("5점").click();
  await page.getByPlaceholder("코멘트 입력").fill("상세 모달에서 작성");
  await expect(page.locator("textarea")).toHaveValue("상세 모달에서 작성");
  await page.getByTitle("닫기").click();
  await expect(page.getByRole("dialog", { name: "test-photo.jpg" })).toBeHidden();
});

test("selection mode supports selected actions", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.getByRole("button", { name: "선택", exact: true }).click();
  await page.getByRole("button", { name: /test-photo.jpg/ }).click();
  await page.getByRole("button", { name: /test-photo-2.jpg/ }).click();
  await expect(page.getByText("2개 선택됨")).toBeVisible();
  await expect(page.getByRole("button", { name: /앨범 만들기/ })).toBeEnabled();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("원본 파일은 삭제되지 않습니다");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("2개 항목을 등록 목록에서 지웠습니다.")).toBeVisible();
  await expect(page.getByText("아직 담긴 사진과 영상이 없습니다.")).toBeVisible();
});

test("album view opens immersive reader", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles([
    "tests/fixtures/test-photo.jpg",
    "tests/fixtures/test-photo-2.jpg",
  ]);

  await page.getByRole("tab", { name: /앨범보기/ }).click();
  await page.getByRole("button", { name: /전체창으로 보기/ }).click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeVisible();
  await expect(page.locator(".albumFullscreen .albumPager")).toContainText("책장");
  await page.getByTitle("닫기").click();
  await expect(page.getByRole("dialog", { name: "앨범 전체창" })).toBeHidden();
});
