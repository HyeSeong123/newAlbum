import { expect, test } from '@playwright/test';

function silentWav() {
  const sampleRate = 8000;
  const samples = sampleRate * 10;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  return bytes;
}

test('audio imports without a MIME type and keeps player keys inside the current recording', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(['silence.wav', 'other.wav'].map((name) => ({ name, mimeType: '', buffer: silentWav() })));
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'silence.wav 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  const audio = detail.locator('audio');
  await expect(audio).toHaveAttribute('controls', '');
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
  await audio.press('ArrowRight');
  await expect(detail.locator('.detailFileName')).toHaveText('silence.wav');
  await detail.getByTitle('즐겨찾기', { exact: true }).click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);

  const previousPlayer = await audio.elementHandle();
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailFileName')).toHaveText('other.wav');
  expect(await previousPlayer!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  const closingPlayer = await audio.elementHandle();
  await detail.getByTitle('닫기', { exact: true }).click();
  await expect(detail).toHaveCount(0);
  expect(await closingPlayer!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
});

test('unsupported video data shows recovery guidance and can be retried', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'damaged.MP4', mimeType: '', buffer: Buffer.from('invalid video fixture') });
  await page.getByRole('button', { name: 'damaged.MP4 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await expect(detail.getByRole('status')).toContainText('영상을 재생할 수 없습니다.');
  await detail.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(detail.getByRole('status')).toContainText('파일 위치와 재생 가능한 형식인지 확인해 주세요.');
  await detail.getByTitle('닫기', { exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(1);
});

test('moving to another photo clears the comment draft while retaining the author', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(['tests/fixtures/test-photo.jpg', 'tests/fixtures/test-photo-2.jpg']);
  await page.getByRole('button', { name: 'test-photo.jpg 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await detail.getByRole('button', { name: '정보·기록', exact: true }).click();
  await detail.getByPlaceholder('작성자').fill('나');
  await detail.getByPlaceholder('내용 입력').fill('첫 사진에 쓰던 기록');
  await detail.getByTitle('다음', { exact: true }).click();
  await expect(detail.locator('.detailFileName')).toHaveText('test-photo-2.jpg');
  await expect(detail.getByPlaceholder('내용 입력')).toHaveValue('');
  await expect(detail.getByPlaceholder('작성자')).toHaveValue('나');
  await expect(detail.getByRole('button', { name: '확인', exact: true })).toBeDisabled();
});
