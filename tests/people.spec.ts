import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('local models detect faces without remote requests', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Run real inference once; management UI is covered on both viewports.');
  test.setTimeout(120_000);
  await page.route('**/face-test.jpg', (route) => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  await page.goto('/');
  // Observe inference requests only after the app's existing web fonts settle.
  await page.evaluate(() => document.fonts.ready);
  const external: string[] = [];
  page.on('request', (request) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url());
  });
  const faces = await page.evaluate(async () => {
    const path = '/src/features/people/faceService.ts';
    const { detectPhotoFaces } = await import(/* @vite-ignore */ path);
    const result = await detectPhotoFaces('/face-test.jpg');
    return result.map((face: { descriptor: number[]; thumbnail: string }) => ({ length: face.descriptor.length, valid: face.descriptor.every(Number.isFinite), thumbnail: face.thumbnail.startsWith('data:image/jpeg;base64,') }));
  });
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.every((face: { length: number; valid: boolean; thumbnail: boolean }) => face.length === 128 && face.valid && face.thumbnail)).toBe(true);
  expect(external).toEqual([]);
});

test('person photos match gallery sizing and create an album from unique originals', async ({ page }) => {
  await page.addInitScript(() => {
    const media = [1, 2].map((id) => ({ id, file_path: `C:/person-album-${id}.jpg`, file_type: 'image', taken_at: '2026-09-14', width: 640, height: 480, duration: null, size_bytes: 2000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
    const faces = [
      { id: 11, media_id: 1, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
      { id: 12, media_id: 1, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
      { id: 13, media_id: 2, person_id: 7, thumbnail: '/favicon.svg', confirmed: true },
    ];
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/favicon.svg',
      invoke: async (command: string, args: { mediaIds?: number[] }) => {
        if (command === 'list_media') return media;
        if (command === 'list_albums') return [];
        if (command === 'list_face_index') return { people: [{ id: 7, name: '가족' }], faces, scanned: [1, 2] };
        if (command === 'create_album_from_media') {
          document.documentElement.dataset.personAlbumIds = JSON.stringify(args.mediaIds);
          return 1;
        }
        return [];
      },
    } });
  });

  await page.goto('/');
  const galleryWidth = (await page.locator('.mediaTile').first().boundingBox())!.width;
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '가족 2장', exact: true }).click();
  const personWidth = (await page.locator('.personMediaGrid .personPhoto').first().boundingBox())!.width;
  expect(Math.abs(personWidth - galleryWidth)).toBeLessThan(1);

  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).first().click();
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).nth(2).click();
  await page.getByRole('button', { name: '앨범 만들기 (2)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '앨범 만들기' })).toBeVisible();
  await page.getByLabel('제목').fill('가족 사진');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-person-album-ids', '[1,2]');
  await page.screenshot({ path: `test-results/person-photo-grid-${test.info().project.name}.png`, fullPage: true });
});

test('people can be named, split, moved and reopened', async ({ page }) => {
  const thumbnail = `data:image/jpeg;base64,${(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail }) => {
    type Index = { people: { id: number; name: string; cover_face_id?: number | null }[]; faces: { id: number; media_id: number; person_id: number; thumbnail: string; confirmed: boolean }[]; scanned: number[]; excluded?: number[] };
    const initial: Index = { people: [{ id: 1, name: '' }, { id: 2, name: '가족' }], faces: [1, 2, 3].map((id) => ({ id, media_id: id, person_id: id === 3 ? 2 : 1, thumbnail, confirmed: false })), scanned: [1, 2, 3] };
    const state: Index = JSON.parse(localStorage.getItem('face-test-state') || 'null') || initial;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => thumbnail,
      invoke: async (command: string, args: { id: number; name: string; ids: number[]; target: number | null; excluded: boolean }) => {
        if (command === 'list_media') return [1, 2, 3].map((id) => ({ id, file_path: `C:/test/${id}.jpg`, file_type: 'image', taken_at: '2026-09-06', width: 640, height: 480, duration: null, size_bytes: 2000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
        if (command === 'list_albums') return [];
        if (command === 'list_face_index') {
          const faces = state.faces.filter((face) => !state.excluded?.includes(face.id));
          return { ...state, faces, people: state.people.filter((person) => faces.some((face) => face.person_id === person.id)) };
        }
        if (command === 'set_faces_excluded') state.excluded = args.excluded ? [...(state.excluded ?? []), ...args.ids] : (state.excluded ?? []).filter((id) => !args.ids.includes(id));
        if (command === 'find_face_matches') return state.faces.filter((face) => !face.confirmed && face.person_id === 1).map((face) => ({ face_id: face.id, person_id: 2 }));
        if (command === 'rename_face_person') state.people.find((person) => person.id === args.id)!.name = args.name.trim();
        if (command === 'set_person_cover_face') {
          const person = state.people.find((entry) => entry.id === (args as any).personId)!;
          if (!state.faces.some((face) => face.id === (args as any).faceId && face.person_id === person.id)) throw new Error('wrong person');
          person.cover_face_id = (args as any).faceId;
        }
        if (command === 'move_faces') {
          const id = args.target ?? Math.max(...state.people.map((person) => person.id)) + 1;
          if (args.target === null) state.people.push({ id, name: '' });
          state.faces.forEach((face) => { if (args.ids.includes(face.id)) { face.person_id = id; face.confirmed = true; } });
        }
        if (command === 'clear_face_index') { state.people = []; state.faces = []; state.scanned = []; }
        localStorage.setItem('face-test-state', JSON.stringify(state));
      },
    } });
  }, { thumbnail });
  await page.goto('/');
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await expect(page.locator('.personTile')).toHaveCount(2);
  const unknownSection = page.getByRole('region', { name: '미확인 얼굴', exact: true });
  await unknownSection.getByRole('button', { name: '미확인 얼굴 선택', exact: true }).click();
  await unknownSection.getByRole('button', { name: '미확인 얼굴 2장', exact: true }).click();
  await expect(unknownSection.getByText('2개 얼굴 선택')).toBeVisible();
  await page.screenshot({ path: `test-results/unknown-exclude-${test.info().project.name}.png`, fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await unknownSection.getByRole('button', { name: '선택한 얼굴 제외', exact: true }).click();
  await expect(unknownSection.getByText('미확인 얼굴이 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '가족 1장', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '제외 되돌리기', exact: true }).click();
  await expect(unknownSection.getByRole('button', { name: '미확인 얼굴 2장', exact: true })).toBeVisible();
  await unknownSection.getByRole('button', { name: '선택 끝내기', exact: true }).click();
  await page.getByRole('button', { name: '미확인 얼굴 다시 비교' }).click();
  await expect(page.getByRole('dialog', { name: '이름 있는 인물과 다시 비교' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '선택한 얼굴 적용', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').first().check();
  await page.screenshot({ path: `test-results/people-match-review-${test.info().project.name}.png` });
  await page.getByTitle('닫기', { exact: true }).click();
  await expect(page.locator('.personTile')).toHaveCount(2);
  await expect(page.locator('.personTile').first()).toContainText('가족');
  await page.screenshot({ path: `test-results/people-groups-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '얼굴 제외', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '인물별 보기', exact: true }).click();
  await page.getByRole('region', { name: '미확인 얼굴', exact: true }).getByRole('button', { name: '미확인 얼굴 2장', exact: true }).click();
  await page.getByLabel('인물 이름').fill('우리 가족');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리 가족' })).toBeVisible();
  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택' }).first().click();
  await page.screenshot({ path: `test-results/people-edit-${test.info().project.name}.png`, fullPage: false });
  await page.getByRole('button', { name: '새 인물로 분리' }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(1);
  await page.getByRole('button', { name: '얼굴 선택' }).click();
  await page.getByLabel('옮길 인물').selectOption('2');
  await page.getByRole('button', { name: '옮기기', exact: true }).click();
  await expect(page.locator('.personTile')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '가족 2장', exact: true }).click();
  await page.getByRole('button', { name: '대표 사진 변경', exact: true }).click();
  await page.getByRole('button', { name: '대표 사진으로 설정' }).nth(1).click();
  await expect(page.locator('.personPhoto').nth(1).locator('.personCoverBadge')).toHaveText('대표');
  await page.screenshot({ path: `test-results/people-cover-selected-${test.info().project.name}.png`, fullPage: false });
  await page.getByTitle('인물 목록').click();
  await expect(page.getByRole('button', { name: '가족 2장', exact: true })).toHaveAttribute('data-cover-face-id', '3');
  await page.reload();
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await expect(page.getByRole('button', { name: '가족 2장', exact: true })).toHaveAttribute('data-cover-face-id', '3');
  await page.getByRole('button', { name: '가족 2장', exact: true }).click();
  await page.getByRole('button', { name: '사진 상세보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '사진 상세' })).toBeVisible();
  await page.getByTitle('닫기').click();
  await expect(page.locator('.personPhoto')).toHaveCount(2);
  await page.getByTitle('인물 목록').click();
  await page.getByRole('button', { name: '미확인 얼굴 1장', exact: true }).click();
  await page.getByLabel('인물 이름').fill(' 가족 ');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '합치기', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '미확인 얼굴', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '합치기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가족', exact: true })).toBeVisible();
  await expect(page.locator('.personPhoto')).toHaveCount(3);
  await page.getByRole('button', { name: '얼굴 모아보기', exact: true }).click();
  const faceBox = await page.locator('.faceOverviewGrid .personOriginal').first().boundingBox();
  expect(faceBox!.width).toBeLessThanOrEqual(128);
  expect(Math.abs(faceBox!.height - faceBox!.width)).toBeLessThan(1);
  await page.getByRole('button', { name: '얼굴 선택하기', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).first().click();
  await page.screenshot({ path: `test-results/people-exclusion-${test.info().project.name}.png` });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '얼굴 제외', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(2);
  await page.getByRole('button', { name: '제외 되돌리기', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(3);
  await page.getByRole('button', { name: '얼굴 선택', exact: true }).first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '얼굴 제외', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await expect(page.locator('.personTile')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '가족 2장', exact: true })).toBeVisible();
  // Restore the fixture to continue the legacy duplicate-name scenario.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('face-test-state')!);
    state.excluded = [];
    localStorage.setItem('face-test-state', JSON.stringify(state));
  });
  // Simulate duplicate names saved by the older version.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('face-test-state')!);
    state.people.push({ id: 99, name: '가족' });
    state.faces[0].person_id = 99;
    localStorage.setItem('face-test-state', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '가족 1장', exact: true }).click();
  await expect(page.getByRole('button', { name: '합치기', exact: true })).toBeEnabled();
  await page.screenshot({ path: `test-results/people-duplicate-${test.info().project.name}.png` });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '합치기', exact: true }).click();
  await expect(page.locator('.personPhoto')).toHaveCount(3);
});

test('review applies only checked face suggestions', async ({ page }) => {
  const thumbnail = `data:image/jpeg;base64,${(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail }) => {
    const faces = [1, 2, 3].map((id) => ({ id, media_id: id, person_id: id === 1 ? 1 : 2, confirmed: false, thumbnail }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => thumbnail,
      invoke: async (command: string, args: { ids: number[]; target: number }) => {
        if (command === 'list_media' || command === 'list_albums') return [];
        if (command === 'list_face_index') return { people: [{ id: 1, name: '아버님' }, { id: 2, name: '' }], faces, scanned: [] };
        if (command === 'find_face_matches') return faces.filter((face) => face.person_id === 2).map((face) => ({ face_id: face.id, person_id: 1 }));
        if (command === 'move_faces') {
          for (const face of faces) if (args.ids.includes(face.id)) { face.person_id = args.target; face.confirmed = true; }
          document.documentElement.dataset.reassigned = JSON.stringify(args.ids);
        }
      },
    } });
  }, { thumbnail });
  await page.goto('/');
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '미확인 얼굴 다시 비교' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: '선택한 얼굴 적용 (1)', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-reassigned', '[2]');
  await expect(page.getByRole('button', { name: '아버님 2장', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '미확인 얼굴 다시 비교' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('analysis stops after current photo and retries failed photos', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Real analysis queue runs once on desktop.');
  test.setTimeout(120_000);
  const thumbnail = `data:image/jpeg;base64,${(await readFile('node_modules/@vladmandic/face-api/demo/sample1.jpg')).toString('base64')}`;
  await page.addInitScript(({ thumbnail }) => {
    const state = { people: [] as { id: number; name: string }[], faces: [] as { id: number; person_id: number; media_id: number; thumbnail: string; confirmed: boolean }[], scanned: [] as number[] };
    const saves: number[] = [];
    let failed = false;
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => thumbnail,
      invoke: async (command: string, args: { mediaId: number; faces: { thumbnail: string }[] }) => {
        if (command === 'list_media') return [1, 2].map((id) => ({ id, file_path: `C:/test/${id}.jpg`, file_type: 'image', taken_at: '2026-09-06', size_bytes: 2000, rating: 0, comment: '', favorite: false, metadata_status: 'ready' }));
        if (command === 'list_albums') return [];
        if (command === 'list_face_index') return state;
        if (command === 'save_face_scan') {
          saves.push(args.mediaId);
          document.documentElement.dataset.faceSaves = JSON.stringify(saves);
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (args.mediaId === 2 && !failed) { failed = true; throw new Error('Test transient failure'); }
          state.scanned.push(args.mediaId);
          for (const face of args.faces) {
            const id = state.faces.length + 1;
            state.people.push({ id, name: '' });
            state.faces.push({ id, person_id: id, media_id: args.mediaId, thumbnail: face.thumbnail, confirmed: false });
          }
        }
      },
    } });
  }, { thumbnail });
  await page.goto('/');
  await page.getByRole('button', { name: '인물', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 찾기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-face-saves', '[1]', { timeout: 60_000 });
  await page.getByRole('button', { name: '중단', exact: true }).click();
  await expect(page.getByText('분석을 중단했습니다.')).toBeVisible();
  await expect(page.locator('.peopleSummary')).toContainText('1 / 2장');
  await page.screenshot({ path: 'test-results/people-real-faces.png', fullPage: false });
  await page.getByRole('button', { name: '이어서 분석', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1장의 사진을 분석하지 못했습니다.', { timeout: 60_000 });
  await page.getByRole('button', { name: '이어서 분석', exact: true }).click();
  await expect(page.locator('.peopleSummary')).toContainText('2 / 2장', { timeout: 60_000 });
  await expect(page.locator('html')).toHaveAttribute('data-face-saves', '[1,2,2]');
});
