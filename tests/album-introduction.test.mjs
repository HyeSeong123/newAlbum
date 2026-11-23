import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { albumIntroductionText } = await import(await modelUrl('features/albums/albumIntroductionContent.ts'));
const media = (id, title, comment) => ({ id: String(id), title, comment, fileName: 'private-photo.jpg', filePath: '/private/photo.jpg', latitude: 12.123, thumbnail: 'private-image-byte' });
const page = (id, kind, title, body, mediaId) => ({ id, kind, title, body, mediaId, displayDuration: 5, transitionType: 'fade', commentVisible: true });

test('only written album data is extracted in saved chapter and letter order', () => {
  const album = { title: '제주 여행', description: '친구와 쉬었다',
    items: [media(1, '바다', '바람이 차가웠다'), media(2, '식당', '맛있었다')],
    contents: [page('a','PHOTO','','','1'),page('b','CHAPTER','둘째 날','아침 산책'),page('c','PHOTO','','','2'),page('d','TEXT','작은 편지','오래 기억할게')] };
  const result = albumIntroductionText(album);
  assert.equal(result.hasStory, true);
  assert.deepEqual(result.sections, ['앨범 제목: 제주 여행','앨범 설명: 친구와 쉬었다','사진 제목: 바다','사진 설명: 바람이 차가웠다','챕터 제목: 둘째 날','챕터 내용: 아침 산책','사진 제목: 식당','사진 설명: 맛있었다','편지 제목: 작은 편지','편지 내용: 오래 기억할게']);
  for (const forbidden of ['/private/', '12.123','private-image-byte','private-photo.jpg']) assert.equal(result.sections.join('|').includes(forbidden),false);
});

test('linked diary rendering does not enter introduction text', () => {
  const album = { title: '일기 연결 앨범', description:'', items:[media(1,'','내 메모')], contents: [page('p1','PHOTO','','','1')] };
  const screenOnlyDiary = page('diary-7','TEXT','연결 일기','소개 대상 아님');
  const actual = albumIntroductionText(album);
  assert.deepEqual(actual.sections,['앨범 제목: 일기 연결 앨범','사진 설명: 내 메모']);
  assert.equal(screenOnlyDiary.body.includes('소개 대상 아님'),true);
});

test('empty title-only album is not treated as shareable; legacy photos remain shareable', () => {
  assert.deepEqual(albumIntroductionText({title:'제목만',description:'',items:[],contents:[]}),{sections:['앨범 제목: 제목만'],hasStory:false});
  assert.deepEqual(albumIntroductionText({title:'이전 앨범',description:'',items:[media(1,'바다','즐거움')]}).sections,['앨범 제목: 이전 앨범','사진 제목: 바다','사진 설명: 즐거움']);
});

test('duplicate media and missing references neither repeat text nor change album data', () => {
  const album={title:'앨범',description:'',items:[media(1,'첫날','반가웠다')],contents:[page('a','PHOTO','','','1'),page('b','PHOTO','','','1'),page('c','PHOTO','','','999')]};
  const before=JSON.stringify(album);
  assert.deepEqual(albumIntroductionText(album).sections,['앨범 제목: 앨범','사진 제목: 첫날','사진 설명: 반가웠다']);
  assert.equal(JSON.stringify(album),before);
});
