import { expect, test } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/trip-photo-*.jpg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#cdbca4"/></svg>'}));
  await page.addInitScript(()=>{
    const dated: Array<[number,string,string,string]> = [
      [1,'2026-08-12','KR-49','image'],[2,'2026-08-12','KR-49','video'],[3,'2026-08-13','KR-49','image'],
      [4,'2026-08-14','KR-26','image'],[5,'2026-08-14','KR-26','image'],[6,'2026-08-15','KR-26','image'],
      [7,'2026-08-20','KR-49','image'],[8,'2026-08-20','KR-49','image'],[9,'2026-08-21','KR-49','image'],
      [10,'2026-08-01','KR-11','image'],[11,'2026-08-02','KR-11','image'],
    ];
    const entries=location.search.includes('sparse')?dated.slice(-2):location.search.includes('many')?Array.from({length:13},(_,i)=>Array.from({length:3},(_,j)=>[i*3+j+1,new Date(Date.UTC(2024,0,1+i*6+(j===2?1:0))).toISOString().slice(0,10),'KR-49','image'] as [number,string,string,string])).flat():dated;
    const media=entries.map(([id,date,code,kind])=>({id,file_path:`C:/trip-photo-${id}.jpg`,file_type:kind,taken_at:date,region_code:code,region_name:code==='KR-49'?'제주특별자치도':code==='KR-26'?'부산광역시':'서울특별시',
      location_status:'ready',location_source:'gps',title:`여행 기록 ${id}`,width:600,height:400,size_bytes:200,rating:0,comment:'함께한 날',favorite:false,metadata_status:'ready'}));
    const albums:unknown[]=[];
    Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{convertFileSrc:(path:string)=>'/'+path.split('/').pop(),invoke:async(command:string,args:any={})=>{
      if(command==='list_media') return media;
      if(command==='list_albums') return albums;
      if(command==='media_thumbnail') return `C:/trip-photo-${args.id}.jpg`;
      if(command==='increment_media_view') return 1;
      if(command==='create_album_from_media') {
        localStorage.setItem('trip-created-album',JSON.stringify(args));
        albums.push({id:1,title:args.title,description:'',cover_color:args.coverColor,created_at:'2026-09-27',items:args.mediaIds.map((id:number)=>media.find(i=>i.id===id))}); return 1;
      }
      if(command==='analyze_locations') throw new Error('Trips must never scan files');
      return [];
    }}});
  });
});

async function memories(page:import('@playwright/test').Page,query='') {
  await page.goto('/'+query); await page.getByRole('button',{name:'추억',exact:true}).click();
}

test('travel candidates separate visits, show counts and open the existing photo detail',async({page})=>{
  await memories(page);
  await expect(page.locator('.tripCard')).toHaveCount(3);
  const card=page.locator('.tripCard').filter({hasText:'2026-08-12 ~ 2026-08-13'});
  await expect(card).toContainText('사진 2장 · 영상 1개');
  await expect(card.locator('img')).toBeVisible();
  const coverBox=await card.locator('.mediaVisual').boundingBox();
  const imageBox=await card.locator('img').boundingBox();
  expect(imageBox!.x).toBeGreaterThanOrEqual(coverBox!.x);
  expect(imageBox!.y).toBeGreaterThanOrEqual(coverBox!.y);
  expect(imageBox!.y+imageBox!.height).toBeLessThanOrEqual(coverBox!.y+coverBox!.height+1);
  await card.getByRole('button',{name:'기록 보기'}).click();
  const records=page.getByRole('region',{name:'여행 기록 목록'});
  await expect(records.locator('.recordMediaGrid > button')).toHaveCount(3);
  await records.getByRole('button',{name:'여행 기록 1 상세보기',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'사진 상세'});
  await expect(detail.getByLabel('사진 제목',{exact:true})).toHaveValue('여행 기록 1');
  await detail.getByTitle('닫기',{exact:true}).click();
  await records.getByRole('button',{name:'여행 후보 목록'}).click();
  await expect(page.locator('.tripCard')).toHaveCount(3);
});

test('candidate album uses an editable suggested title and chronological media only after confirmation',async({page})=>{
  await memories(page);
  const card=page.locator('.tripCard').filter({hasText:'2026-08-12 ~ 2026-08-13'});
  await card.getByRole('button',{name:'앨범 만들기'}).click();
  const modal=page.getByRole('dialog',{name:'앨범 만들기'});
  await expect(modal.getByLabel('제목',{exact:true})).toHaveValue('2026년 제주 여행');
  expect(await page.evaluate(()=>localStorage.getItem('trip-created-album'))).toBeNull();
  await modal.getByRole('button',{name:'취소',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('trip-created-album'))).toBeNull();
  await card.getByRole('button',{name:'기록 보기'}).click();
  await page.getByRole('region',{name:'여행 기록 목록'}).getByRole('button',{name:'앨범 만들기'}).click();
  await modal.getByLabel('제목',{exact:true}).fill('우리의 제주 여행');
  await modal.getByRole('button',{name:'만들기',exact:true}).click();
  await expect(modal).toHaveCount(0);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-created-album')!));
  expect(saved.title).toBe('우리의 제주 여행'); expect(saved.mediaIds).toEqual([1,2,3]);
  await page.getByRole('button',{name:'우리의 제주 여행 앨범 열기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'앨범 전체창'})).toBeVisible();
  await page.getByRole('button',{name:'스토리로 보기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'앨범 스토리'})).toBeVisible();
});

test('two-photo visits do not generate travel recommendations',async({page})=>{
  await memories(page,'?sparse');
  await expect(page.getByRole('group',{name:'추억 보기'})).toBeVisible();
  await expect(page.getByRole('region',{name:'여행 후보',exact:true})).toHaveCount(0);
});

test('candidate covers are paged and the layout fits narrow screens',async({page})=>{
  await memories(page,'?many');
  await expect(page.locator('.tripCard')).toHaveCount(12);
  const pager=page.getByRole('navigation',{name:'여행 후보 페이지'});
  await pager.getByRole('button',{name:'다음',exact:true}).click();
  await expect(page.locator('.tripCard')).toHaveCount(1);
  await expect(pager).toContainText('2 / 2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('search filters travel candidates in rediscovery', async ({page}) => {
  await memories(page);
  await expect(page.locator('.tripCard')).toHaveCount(3);
  const search = page.getByRole('textbox', {name:'사진과 추억 검색'});
  await search.fill('여행 기록 1');
  await expect(page.locator('.tripCard')).toHaveCount(0);
  await search.fill('');
  await expect(page.locator('.tripCard')).toHaveCount(3);
});
