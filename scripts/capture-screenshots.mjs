import { chromium, devices } from "playwright";

const browser = await chromium.launch();
const baseUrl = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173/";

async function capture(name, options, setup) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(baseUrl);
  if (setup) await setup(page);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
  await context.close();
}

await capture("desktop", { viewport: { width: 1440, height: 1000 } });
await capture("mobile", devices["Pixel 7"]);
await capture("calendar-empty", { viewport: { width: 1440, height: 1000 } }, async (page) => {
  await page.getByRole("tab", { name: /달력보기/ }).click();
});
await capture("album-empty", { viewport: { width: 1440, height: 1000 } }, async (page) => {
  await page.getByRole("tab", { name: /앨범보기/ }).click();
});

await browser.close();
