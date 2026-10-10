import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Exercise the actual bundled clients and shared scheduler through the installed
// app UI. A dog fixture is intentional: a zero-face result must not be presented
// as successful human identification. The existing runtime smoke covers 3 faces.
export async function verifyInstalledRepetitionMeasurement(page, mediaId) {
  const before = await page.evaluate(async id => ({
    faces: await window.__TAURI_INTERNALS__.invoke('list_face_index'),
    pet: await window.__TAURI_INTERNALS__.invoke('get_pet_scan', { mediaId: id }),
  }), mediaId);
  await page.getByRole('tab', { name: '사람', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 관리', exact: true }).click();
  await page.getByRole('button', { name: '인식 검증·기기 측정', exact: true }).click();
  const panel = page.getByRole('region', { name: '이 기기 인물 처리 속도' });
  await panel.getByLabel('인물 기기 측정 방식').selectOption('alternating');
  await panel.getByLabel('인물 속도 측정 사진').selectOption(String(mediaId));
  await panel.getByLabel('반려동물 전환 측정 사진').selectOption(String(mediaId));
  await panel.getByRole('button', { name: '이 기기 인물 속도 측정', exact: true }).click();
  await expect(panel).toContainText('반복 측정 완료 · 40장 분석 · 인물·반려동물 전환 39회', { timeout: 180_000 });
  await expect(panel).toContainText('인물 사진에서 얼굴을 찾지 못했습니다.');
  await expect(panel).toContainText('반려동물 20회 · wasm');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const after = await page.evaluate(async id => ({
    faces: await window.__TAURI_INTERNALS__.invoke('list_face_index'),
    pet: await window.__TAURI_INTERNALS__.invoke('get_pet_scan', { mediaId: id }),
  }), mediaId);
  assert.deepEqual(after, before, 'Repetition measurement must preserve stored people/pet links and features');
  const summary = await panel.locator('div[role="status"]').innerText();
  await panel.screenshot({ path: 'test-results/android-smoke/person-repetition-measurement.png' });
  await page.getByRole('button', { name: '얼굴 관리', exact: true }).click();
  await page.getByRole('button', { name: '인식 검증 닫기', exact: true }).click();
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  return { summary, cycles: 20, domainSwitches: 39, identityLinksPreserved: true, offline: true, identityAccuracyMeasured: false, phonePerformanceMeasured: false, wholeAppPeakMemoryMeasured: false };
}
