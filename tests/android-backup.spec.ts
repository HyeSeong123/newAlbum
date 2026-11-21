import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("Android backup buttons, totals, cancellation and retry on narrow screens", async ({page}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.addInitScript(() => {
    const counts = {media:2,albums:1,diaries:3,characters:2};
    Object.assign(window, {
      __GOMGOMI_BACKUP__:true,
      __TAURI_INTERNALS__: {
        convertFileSrc:()=>"/favicon.svg",
        invoke: async (command:string,args:{action?:string}={}) => {
          if (command === "android_backup_action") {
            if (args.action === "export") return null;
            if (args.action === "preview") {
              if (!sessionStorage.getItem("backup-test-retry")) {
                sessionStorage.setItem("backup-test-retry","true"); throw new Error("백업 파일이 손상되었습니다.");
              }
              return {current:counts,restored:{...counts,diaries:1},token:"fixture"};
            }
            return null;
          }
          if (command==="plugin:app|version") return "0.9.60";
          if (command==="sync_characters") return {characters:[],events:[]};
          if (command==="check_android_location_setup") return {locationEnabled:true,photoLocationGranted:true};
          return [];
        }
      }
    });
  });
  await page.goto("/");
  const settings = page.getByRole("button",{name:"설정",exact:true}).filter({visible:true});
  if (!await settings.count()) await page.getByRole("button",{name:"전체 메뉴",exact:true}).click();
  await settings.click();
  const panel=page.getByRole("region",{name:"기록 백업과 복원"});
  await panel.getByRole("button",{name:"백업 파일 만들기"}).click();
  await expect(panel.getByRole("status")).toHaveText("백업을 취소했어요.");
  await panel.getByRole("button",{name:"백업에서 복원"}).click();
  await expect(panel.getByRole("status")).toContainText("손상");
  await mkdir("preview-results/audit",{recursive:true});
  for (const width of [320,360,393]) {
    await page.setViewportSize({width,height:780});
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({path:`preview-results/audit/backup-settings-${width}.png`,fullPage:true});
    await panel.getByRole("button",{name:"백업에서 복원"}).click();
    const dialog=page.getByRole("dialog",{name:"백업으로 기록을 바꿀까요?"});
    await expect(dialog.getByRole("row",{name:/일기/}).getByRole("cell")).toHaveText(["3","1"]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const button of await dialog.getByRole("button").all()) {
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({path:`preview-results/audit/backup-restore-${width}.png`});
    await dialog.getByRole("button",{name:"현재 기록 유지"}).click();
    await expect(panel.getByRole("status")).toContainText("현재 기록을 유지");
  }
});
