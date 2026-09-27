import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/region-photo-*.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#e1e7d1"/></svg>' }));
  await page.addInitScript(() => {
    type Record = { id:number; file_path:string; title:string; file_type:string; taken_at:string|null; region_code:string|null; region_name:string|null; location_source:string; location_status:string; width:number; height:number; size_bytes:number; rating:number; favorite:boolean; comment:string; metadata_status:string };
    const names: { [key:string]:string } = { 'KR-49':'제주특별자치도','KR-11':'서울특별시','KR-26':'부산광역시' };
    const large = location.search.includes('large');
    let media: Record[] = JSON.parse(localStorage.getItem('region-test-media') || 'null') ?? Array.from({length:large ? 60 : 8}, (_,index) => ({
      id:index+1, file_path:`C:/region-photo-${index+1}.jpg`, title:`기록 ${index+1}`, file_type:index===2 ? 'video':'image',
      taken_at:index===7 ? null : `${index===3 ? '2026' : '2025'}-08-${String(12+index).padStart(2,'0')}`,
      region_code:!large && index<2 ? null:'KR-49', region_name:!large && index<2 ? null:names['KR-49'],
      location_source:'gps', location_status:!large && index<2 ? 'no-gps':'ready',
      width:480,height:360,size_bytes:123,rating:0,favorite:false,comment:'',metadata_status:'ready',
    }));
    const albums: unknown[] = [];
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{
      convertFileSrc:(path:string)=>'/'+path.split('/').pop(),
      invoke:async(command:string,args:any={})=> {
        if(command==='list_media') return media;
        if(command==='list_albums') return albums;
        if(command==='media_thumbnail') return `C:/region-photo-${args.id}.jpg`;
        if(command==='increment_media_view') return 1;
        if(command==='location_overview') return {total:media.length,analyzed:media.length,pending:0,failed:0,unclassified:media.filter(i=>!i.region_code).length,
          regions:Object.entries(names).map(([code,name])=>({code,name,photos:media.filter(i=>i.region_code===code&&i.file_type==='image').length,videos:media.filter(i=>i.region_code===code&&i.file_type==='video').length}))};
        if(command==='assign_media_region') {
          if(localStorage.getItem('region-test-fail')) throw new Error('save failed');
          media = media.map(i=>args.ids.includes(i.id)?{...i,region_code:args.regionCode,region_name:names[args.regionCode],location_source:'manual',location_status:'ready'}:i);
          localStorage.setItem('region-test-media',JSON.stringify(media)); return;
        }
        if(command==='region_media_page') {
          const scope = media.filter(i=>args.regionCode==='unclassified'?!i.region_code:i.region_code===args.regionCode);
          const filtered = scope.filter(i=>(args.fileType==='all'||args.fileType===i.file_type)&&(!args.year||i.taken_at?.startsWith(args.year+'-')))
            .sort((a,b)=>!a.taken_at&&b.taken_at?1:a.taken_at&&!b.taken_at?-1:((a.taken_at??'').localeCompare(b.taken_at??'')||a.id-b.id)*(args.oldest?1:-1));
          return {items:filtered.slice(args.offset,args.offset+48),total:filtered.length,years:[...new Set(scope.flatMap(i=>i.taken_at?[i.taken_at.slice(0,4)]:[]))].sort().reverse()};
        }
        if(command==='create_album_from_media') {
          localStorage.setItem('created-region-album',JSON.stringify(args));
          albums.unshift({id:1,title:args.title,cover_color:args.coverColor,created_at:'2026-09-27',description:'',items:args.mediaIds.map((id:number)=>media.find(i=>i.id===id))}); return 1;
        }
        return [];
      },
    }});
  });
});

async function map(page: import('@playwright/test').Page, query='') {
  await page.goto('/'+query);
  await page.getByRole('button',{name:'지난 추억',exact:true}).click();
  await page.getByRole('group',{name:'추억 보기'}).getByRole('button',{name:'추억 지도'}).click();
}

test('manual region editing persists, updates map counts, and failed saves keep the old region',async({page})=>{
  await map(page);
  await page.locator('.memoryMapUnclassified').click();
  await page.getByRole('button',{name:'기록 1 상세보기',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'사진 상세'});
  await detail.getByRole('button',{name:'지역 지정',exact:true}).click();
  await expect(detail.getByLabel('지정할 지역').locator('option')).toHaveCount(18);
  await detail.getByLabel('지정할 지역').selectOption('KR-11');
  await detail.getByRole('button',{name:'지역 저장'}).click();
  await expect(detail.getByLabel('위치',{exact:true})).toContainText('서울특별시');
  await expect(detail.getByText('직접 지정')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.memoryMapUnclassified strong')).toHaveText('1');
  await page.reload();
  await page.getByRole('button',{name:'지난 추억',exact:true}).click();
  await page.getByRole('group',{name:'추억 보기'}).getByRole('button',{name:'추억 지도'}).click();
  await page.locator('.memoryMapPlaceList button').filter({hasText:'서울'}).click();
  await page.getByRole('button',{name:'기록 1 상세보기',exact:true}).click();
  await expect(detail.getByText('직접 지정')).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('region-test-fail','1'));
  await detail.getByRole('button',{name:'지역 변경'}).click();
  await detail.getByLabel('지정할 지역').selectOption('KR-26');
  await detail.getByRole('button',{name:'지역 저장'}).click();
  await expect(detail.getByRole('alert')).toContainText('지역을 저장하지 못했습니다');
  await detail.getByRole('button',{name:'취소',exact:true}).click();
  await expect(detail.getByLabel('위치',{exact:true})).toContainText('서울특별시');
});

test('bulk unclassified assignment and GPS override update their existing records',async({page})=>{
  await map(page); await page.locator('.memoryMapUnclassified').click();
  const gallery=page.locator('.memoryMapGallery');
  await gallery.getByRole('button',{name:'선택',exact:true}).click();
  await gallery.getByRole('button',{name:'기록 1 선택',exact:true}).click();
  await gallery.getByRole('button',{name:'기록 2 선택',exact:true}).click();
  await gallery.getByRole('button',{name:'지역 지정',exact:true}).click();
  await gallery.getByLabel('지정할 지역').selectOption('KR-49');
  await gallery.getByRole('button',{name:'지역 저장'}).click();
  await expect(gallery).toContainText('필터 결과 0개');
  await page.locator('.memoryMapPlaceList button').filter({hasText:'제주'}).click();
  await gallery.getByRole('button',{name:'기록 4 상세보기',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'사진 상세'});
  await detail.getByRole('button',{name:'지역 변경'}).click();
  await detail.getByLabel('지정할 지역').selectOption('KR-26');
  await detail.getByRole('button',{name:'지역 저장'}).click();
  await expect(detail.getByLabel('위치',{exact:true})).toContainText('부산광역시');
});

test('combined region filters, stable sort and selected album order use existing creation',async({page})=>{
  await map(page); await page.locator('.memoryMapPlaceList button').filter({hasText:'제주'}).click();
  const gallery=page.locator('.memoryMapGallery');
  await gallery.getByLabel('기록 연도').selectOption('2025');
  await gallery.getByLabel('기록 종류').selectOption('video');
  await expect(gallery.locator('.recordMediaGrid > button')).toHaveCount(1);
  await expect(gallery).toContainText('기록 3');
  await gallery.getByLabel('기록 종류').selectOption('all');
  await gallery.getByLabel('기록 정렬').selectOption('oldest');
  await expect(gallery.locator('.recordMediaGrid > button').first()).toContainText('기록 3');
  await gallery.getByRole('button',{name:'선택',exact:true}).click();
  await gallery.getByRole('button',{name:'기록 7 선택',exact:true}).click();
  await gallery.getByRole('button',{name:'기록 3 선택',exact:true}).click();
  await gallery.getByRole('button',{name:'앨범 만들기'}).click();
  const modal=page.getByRole('dialog',{name:'앨범 만들기'});
  await expect(modal).toContainText('2개의 기록');
  await modal.getByLabel('제목',{exact:true}).fill('제주의 기록');
  await modal.getByRole('button',{name:'만들기',exact:true}).click();
  await expect(modal).toHaveCount(0);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('created-region-album')!));
  expect(saved.mediaIds).toEqual([3,7]); expect(saved.title).toBe('제주의 기록');
  await expect(page.getByRole('heading',{name:'내 앨범',exact:true})).toBeVisible();
});

test('large region requires selection, retains choices across pages and clears on filter change',async({page})=>{
  await map(page,'?large'); await page.locator('.memoryMapPlaceList button').filter({hasText:'제주'}).click();
  const gallery=page.locator('.memoryMapGallery');
  await gallery.getByRole('button',{name:'앨범 만들기'}).click();
  await expect(page.getByRole('dialog',{name:'앨범 만들기'})).toHaveCount(0);
  await expect(gallery).toContainText('기록이 많아요');
  await gallery.locator('.recordMediaGrid > button').first().click();
  await gallery.getByRole('navigation',{name:'지역 사진 페이지'}).getByRole('button',{name:'다음',exact:true}).click();
  await expect(gallery.getByRole('navigation',{name:'지역 사진 페이지'})).toContainText('2 / 2');
  await expect(gallery.locator('.recordMediaGrid > button')).toHaveCount(12);
  await gallery.locator('.recordMediaGrid > button').first().click();
  await expect(gallery).toContainText('2개 선택');
  await gallery.getByRole('button',{name:'앨범 만들기'}).click();
  await expect(page.getByRole('dialog',{name:'앨범 만들기'})).toContainText('2개의 기록');
  await page.getByRole('dialog',{name:'앨범 만들기'}).getByRole('button',{name:'취소',exact:true}).click();
  await gallery.getByLabel('기록 종류').selectOption('video');
  await expect(gallery.getByRole('button',{name:'선택',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});

test('memories timeline opens dates and reuses photo detail',async({page})=>{
  await page.goto('/'); await page.getByRole('button',{name:'지난 추억',exact:true}).click();
  await page.getByRole('group',{name:'추억 보기'}).getByRole('button',{name:'우리의 기록'}).click();
  await expect(page.getByLabel('우리의 기록 타임라인')).toBeVisible();
  await page.locator('.timelineDay').first().click();
  await expect(page.getByLabel('날짜별 기록')).toBeVisible();
  await page.locator('.recordMediaGrid > button').first().click();
  await expect(page.getByRole('dialog',{name:'사진 상세'})).toBeVisible();
});
