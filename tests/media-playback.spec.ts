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
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
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
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'damaged.MP4', mimeType: '', buffer: Buffer.from('invalid video fixture') });
  await page.getByRole('button', { name: 'damaged.MP4 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await expect(detail.getByRole('status')).toContainText('영상을 재생할 수 없습니다.');
  await detail.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(detail.getByRole('status')).toContainText('파일 위치와 재생 가능한 형식인지 확인해 주세요.');
  await detail.getByTitle('닫기', { exact: true }).click();
  await expect(page.locator('.mediaTile')).toHaveCount(1);
});


test('valid MP4 starts, seeks and pauses when the detail closes', async ({ page }) => {
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles('tests/fixtures/playback.mp4');
  await page.getByRole('button', { name: 'playback.mp4 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  const video = detail.locator('video');
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(.3);
  await video.evaluate((el: HTMLVideoElement) => { el.pause(); el.currentTime = 6; });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.seeking && el.readyState >= 2)).toBe(true);
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(6.3);
  const player = await video.elementHandle();
  await detail.getByTitle('닫기', { exact: true }).click();
  expect(await player!.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});

test('Android retries a failed native source request before playing the registered video', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Android WebView media routing');
  await page.route('**/abcdef/1', route => route.fulfill({ contentType: 'video/mp4', path: 'tests/fixtures/playback.mp4' }));
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => { throw new Error('Android media must use its range stream'); },
      invoke: async (command: string) => {
        if (command === 'list_media') return [{ id: 1, file_path: '/app/imported-media-v1/playback.mp4', file_type: 'video', size_bytes: 10, comment: '', title: '', favorite: false, rating: 0 }];
        if (command === 'media_playback_source') {
          if (++requests === 1) throw new Error('Temporary source failure');
          return `${location.origin}/abcdef/1`;
        }
        return [];
      },
    } });
  });
  await page.goto('/');
  await page.locator('.navList').getByRole('button', { name: '사진 기록', exact: true }).click();
  await page.getByRole('button', { name: 'playback.mp4 상세보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '사진 상세' });
  await expect(detail.getByRole('status')).toContainText('영상을 재생할 수 없습니다.');
  await detail.getByRole('button', { name: '다시 시도', exact: true }).click();
  const video = detail.locator('video');
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(.3);
});
