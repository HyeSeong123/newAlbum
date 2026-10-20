import type { Page } from '@playwright/test';

export async function auditLibrary(page: Page, empty = false) {
  await page.route('**/audit-photo-*', route => route.fulfill({ path: route.request().url().includes('cat') ? 'tests/fixtures/pet-cat.jpg' : 'tests/fixtures/pet-dog.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(({ empty }) => {
    const media = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, file_path: `/audit-photo-${i < 100 ? 'dog' : 'cat'}-${i}.jpg`, file_type: 'image', taken_at: '2026-10-20', width: 800, height: 600, size_bytes: 2048, favorite: i === 0, rating: 0, comment: '', metadata_status: 'ready' }));
    let imported = !empty;
    const calls: string[] = [];
    Object.defineProperty(window, '__auditCalls', { value: calls });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      convertFileSrc: (path: string) => path,
      invoke: async (command: string) => {
        calls.push(command);
        if (command === 'media_thumbnail') return '';
        if (command === 'list_media') return imported ? media : [];
        if (command === 'list_albums') return empty ? [] : [{ id: 1, title: '함께한 가을', description: '', created_at: '2026-10-20', cover_color: '#E5E1D5', items: media.slice(0, 6) }];
        if (command === 'list_diary') return empty ? [] : [{ id: 1, date: '2026-10-20', title: '가을 산책', body: '함께 걸었던 조용한 하루의 기록입니다.', mood: '평온', weather: '맑음', album_id: null, photos: [] }];
        if (['plugin:dialog|open', 'choose_android_gallery'].includes(command)) return media.map(item => item.file_path);
        if (command === 'register_paths') { imported = true; return media; }
        if (command === 'list_face_index') return { people: [{ id: 1, name: '가족' }], faces: media.slice(0, 24).map(item => ({ id: item.id, media_id: item.id, person_id: 1, thumbnail: item.file_path, confirmed: true })), scanned: [] };
        if (command === 'list_pets') return [{ id: 1, name: '보리', media_ids: [1], cover_media_id: 1 }];
        if (command === 'list_pet_jobs') return { jobs: [], pending: 0, paused: 0, failed: 0 };
        return [];
      },
    } });
  }, { empty });
  await page.goto('/');
}

