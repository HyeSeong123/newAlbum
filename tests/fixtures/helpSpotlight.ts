import { expect, type Page } from '@playwright/test';

/** Native storage is substituted; all help, focus and click behavior is real UI. */
export async function prepareHelp(page: Page, character = 'gomi', affection = 0, mediaCount = 12, pendingEvent = false, waitingJob = false) {
  await page.route('**/spotlight-photo.jpg', route => route.fulfill({ path: 'node_modules/@vladmandic/face-api/demo/sample1.jpg', contentType: 'image/jpeg' }));
  // Model the native asset protocol: packaged character art remains local even
  // while external networking is disabled in the HTTP browser harness.
  await page.route(url => url.pathname.startsWith('/characters/'), route => route.fulfill({ path: `public${new URL(route.request().url()).pathname}` }));
  await page.addInitScript(({ character, affection, mediaCount, pendingEvent, waitingJob }) => {
    localStorage.setItem('geuruteogi.first-run-completed-v1', 'true');
    let media = Array.from({ length: mediaCount }, (_, i) => ({ id: i + 1, file_path: `/photos/${i + 1}.jpg`, file_type: 'image', taken_at: '2026-10-23', title: `사진 ${i + 1}`, rating: 0, favorite: i === 0, comment: '', metadata_status: 'ready' }));
    let characters = ['gomi', 'potato', 'sweet-potato'].map(id => ({ id, customName: id === 'potato' ? '우리 감자' : null, growthStage: id === 'gomi' ? 6 : 1, affection, isMain: character === id, regionPhotoCount: 0 }));
    let events = pendingEvent ? [{ id: 1, characterId: 'potato', kind: 'unlock', stage: 1 }] : [];
    const calls: { command: string; args: any }[] = [];
    Object.assign(window, { spotlightCalls: calls });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: () => '/spotlight-photo.jpg',
      invoke: async (command: string, args: any = {}) => {
        calls.push({ command, args });
        if (command === 'sync_characters') return { characters, events };
        if (command === 'dismiss_character_event') { events = []; return { characters, events }; }
        if (command === 'set_main_character') { characters = characters.map(c => ({ ...c, isMain: c.id === args.id })); return { characters, events: [] }; }
        if (command === 'list_media') return structuredClone(media);
        if (command === 'media_thumbnail') return '/spotlight-photo.jpg';
        if (command === 'update_media_title') { media = media.map(m => m.id === args.id ? { ...m, title: args.title } : m); return; }
        if (command === 'list_face_index') return { people: [{ id: 1, name: '미정', media_ids: [1] }, { id: 9, name: '' }], faces: [{ id: 1, person_id: 9, media_id: 2, confirmed: false, thumbnail: '/spotlight-photo.jpg' }], scanned: [2] };
        if (command === 'find_face_matches') return [{ face_id: 1, person_id: 1, candidates: [{ person_id: 1, distance: .3, references: 2 }] }];
        if (command === 'list_pets') return [{ id: 1, name: '보리', media_ids: [1], cover_media_id: 1 }];
        if (command === 'list_pet_jobs') return { pending: 0, paused: waitingJob ? 1 : 0, failed: 0, jobs: waitingJob ? [{ id: 1, media_id: 1, pet_id: null, view: 'unknown', state: 'paused', error: '' }] : [] };
        if (command === 'compare_android_gallery') return { checked: 0, present: 0, missing: 0, unavailable: 0, untracked: 0, missingCopies: 0 };
        if (command === 'list_albums' || command === 'list_diary' || command === 'list_unknown_pet_items' || command === 'list_pet_detections') return [];
        if (command === 'delete_registered_media') { media = media.filter(m => !args.ids.includes(m.id)); return structuredClone(media); }
        return [];
      },
    } });
  }, { character, affection, mediaCount, pendingEvent, waitingJob });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '홈', exact: true })).toBeVisible();
}

export async function openHelp(page: Page) {
  await page.getByRole('button', { name: '현재 화면 도움말', exact: true }).click();
  await expect(helpDialog(page)).toBeVisible();
  await expect(helpDialog(page)).toHaveAttribute('aria-busy','false');
  await expect(helpDialog(page).locator('.helpGuideCard')).toBeVisible();
}
export const helpDialog = (page: Page) => page.getByRole('dialog', { name: '버튼 도움말', exact: true });

export async function toStep(page: Page, title: string) {
  const guide = helpDialog(page);
  await expect(guide).toBeVisible();
  for (let i = 0; i < 35; i++) {
    await expect(guide.locator('.helpGuideCard')).toBeVisible();
    if (await guide.getByRole('heading', { name: title, exact: true }).isVisible()) return;
    const next = guide.getByRole('button', { name: '다음', exact: true });
    if (!await next.isVisible()) break;
    const before = await guide.locator('h3').innerText();
    await next.click();
    await expect(guide.locator('h3')).not.toHaveText(before);
  }
  await expect(guide.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
