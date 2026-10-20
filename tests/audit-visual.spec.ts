import { expect, test } from '@playwright/test';
import { auditLibrary } from './audit-fixture';

// Native calls are fixture-backed. These captures verify browser layout only.
for (const width of [360, 390, 430, 768, 1280, 1440]) {
  for (const populated of [false, true]) {
    test(`audit layout ${width} ${populated ? 'populated' : 'empty'}`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'One deterministic capture per viewport; touch behavior is tested separately.');
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.setFixedTime(new Date(2026, 9, 20, 12));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (populated) await auditLibrary(page); else await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const stage = process.env.AUDIT_STAGE || 'after';
      for (const [key, name] of [['home', '홈'], ['photos', '사진 기록'], ['albums', '내 앨범'], ['diary', '일기장'], ['memories', '추억'], ['characters', '새싹 도감'], ['people', '사람과 반려동물'], ['settings', '설정']]) {
        await page.locator(key === 'settings' ? '.sidebar' : '.navList').getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.mainPanel')).toBeVisible();
        // Let both font swapping and reduced-motion character images settle.
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `preview-results/audit/${stage}/${width}-${populated ? 'populated' : 'empty'}-${key}.png`, fullPage: true, animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
    });
  }
}
