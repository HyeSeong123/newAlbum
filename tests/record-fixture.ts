import type { Page } from '@playwright/test';
export async function installRecordFixture(page: Page) {
  await page.clock.setFixedTime(new Date(2026,8,27,12));
  await page.route('**/record-fixture-*.jpg', route => route.fulfill({ path:'tests/fixtures/test-photo.jpg',contentType:'image/jpeg' }));
  await page.addInitScript(() => {
    const data = [
      ['2023-09-27','첫 가을','image'],['2023-09-18','가을 바다','video'],['2025-09-27','작년 산책','image'],
      ['2026-09-27','올해 기록','image'],['2027-09-27','미래 기록','image'],[null,'날짜 없는 기록','image'],
      ['2023-08-12','여름 사진','image'],['2023-09-31','날짜 오류','image'],['2023-09-27T23:15:00+09:00','가을 나무','image'],
    ];
    const media = data.map(([taken_at,title,file_type],i) => ({ id:i+1,file_path:`C:/record-fixture-${i+1}.jpg`,taken_at,title,file_type,width:900,height:600,size_bytes:100,rating:0,comment:'함께 남긴 기록',favorite:false,metadata_status:'ready' }));
    localStorage.setItem('oraedameun.dayNotes',JSON.stringify({ '2023-08-12':'여름휴가 · 바다에서 함께 보낸 하루' }));
    Object.defineProperty(window,'__TAURI_INTERNALS__',{ value:{ convertFileSrc:(path:string) => '/'+path.split('/').pop(), invoke:async (command:string) => {
      if (command === 'list_media') return media;
      if (command === 'list_albums') return [];
      if (command === 'increment_media_view') return 1;
      return [];
    } } });
  });
}
