import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Exercise the installed APK's IPC ACL, Kotlin settings intents and resume refresh.
 * Only the emulator's system location toggle changes; no app data or photo grants.
 */
export async function verifyInstalledLocationSettings({ page, adb, appId, captureScreen }) {
  const read = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('check_android_location_setup'));
  const before = await read();
  assert.equal(typeof before.locationEnabled, 'boolean');
  assert.equal(before.photoLocationGranted, false, 'Use the fresh emulator install before importing any photos');
  const ribbon = page.getByRole('complementary', { name: '촬영 위치 설정 알림' });
  const setLocation = enabled => adb('shell', 'cmd', 'location', 'set-location-enabled', String(enabled));
  const foreground = async () => (await adb('shell', 'dumpsys', 'activity', 'activities'))
    .split('\n').filter(line => /topResumedActivity|mResumedActivity/.test(line)).join('\n');
  try {
    await setLocation(false);
    await page.reload();
    await expect(ribbon).toHaveAttribute('data-check-state', 'ready');
    await expect(ribbon).toContainText('휴대폰 위치 기능이 꺼져 있어요');
    await ribbon.getByRole('button', { name: '설정 안내', exact: true }).click();
    await ribbon.getByRole('button', { name: '휴대폰 위치 설정 열기', exact: true }).click();
    await expect.poll(foreground, { timeout: 15_000 }).toMatch(/com\.android\.settings\//);
    assert.ok((await adb('shell', 'dumpsys', 'activity', 'activities')).includes('act=android.settings.LOCATION_SOURCE_SETTINGS'), 'Device button must open location settings');
    await captureScreen('location-settings-device');

    await setLocation(true);
    await adb('shell', 'input', 'keyevent', '4');
    // No reload or synthetic event: the real Android resume must refresh the ribbon.
    await expect(ribbon).toContainText('사진 위치정보 접근을 확인해 주세요');
    await expect(ribbon.getByRole('button', { name: '휴대폰 위치 설정 열기', exact: true })).toHaveCount(0);
    await ribbon.getByRole('button', { name: '감자싹 앱 권한 설정 열기', exact: true }).click();
    await expect.poll(foreground, { timeout: 15_000 }).toMatch(/com\.android\.settings\//);
    const activities = await adb('shell', 'dumpsys', 'activity', 'activities');
    assert.ok(activities.includes('act=android.settings.APPLICATION_DETAILS_SETTINGS'), 'App button must open app details');
    assert.ok(activities.includes(`dat=package:${appId}`), 'App details intent must target the installed Gamjassak package');
    await captureScreen('location-settings-app-permissions');
    await adb('shell', 'input', 'keyevent', '4');
    await expect(page.locator('.homeMascot')).toBeVisible();

    // The toggle changes while Home remains foreground; only the recheck button
    // can update this displayed state. Never replace the real invoke with a mock.
    await setLocation(false);
    await ribbon.getByRole('button', { name: '설정 다시 확인', exact: true }).click();
    await expect(ribbon).toHaveAttribute('data-check-state', 'ready');
    await expect(ribbon).toContainText('휴대폰 위치 기능이 꺼져 있어요');
    await expect(ribbon.getByRole('status')).toContainText('다시 확인했어요');
    await setLocation(true);
    await ribbon.getByRole('button', { name: '설정 다시 확인', exact: true }).click();
    await expect(ribbon).toHaveAttribute('data-check-state', 'ready');
    await expect(ribbon).toContainText('사진 위치정보 접근을 확인해 주세요');
    await expect(ribbon.getByRole('alert')).toHaveCount(0);
    await captureScreen('location-settings-rechecked');
    assert.deepEqual(await read(), { locationEnabled: true, photoLocationGranted: false });
    return { deviceSettingsOpened: true, correctAppSettingsOpened: true, automaticResumeRefresh: true, manualRecheck: true, environment: 'Android API 36 x86_64 emulator' };
  } finally {
    await setLocation(before.locationEnabled);
    if (await ribbon.isVisible()) await ribbon.getByRole('button', { name: '이번에는 알림 닫기', exact: true }).click();
  }
}
