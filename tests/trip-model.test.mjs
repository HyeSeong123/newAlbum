import assert from 'node:assert/strict';
import test from 'node:test';
import { modelUrl } from './model-loader.mjs';
const { discoverTrips, chooseTripCover, TRIP_MAX_DAY_GAP, TRIP_MIN_MEDIA, TRIP_SINGLE_DAY_MIN_MEDIA } = await import(await modelUrl('features/memories/tripModel.ts'));
const item = (id,date,regionCode='KR-49',fileType='image') => ({id:String(id),takenAt:date,regionCode,fileType});

test('same region and consecutive recorded days produce chronological media, counts, cover and editable title suggestion',()=>{
  const records=Object.freeze([item(3,'2026-08-13'),item(1,'2026-08-12','KR-49','video'),item(2,'2026-08-12')].map(Object.freeze));
  const [trip]=discoverTrips(records);
  assert.equal(trip.title,'2026년 여름 제주'); assert.equal(trip.albumTitle,'2026년 제주 여행');
  assert.equal(trip.start,'2026-08-12'); assert.equal(trip.end,'2026-08-13');
  assert.equal(trip.photos,2); assert.equal(trip.videos,1);
  assert.deepEqual(trip.items.map(i=>i.id),['1','2','3']); assert.strictEqual(trip.cover,records[2]);
  assert.equal(records[0].id,'3');
});

test('long date gaps and intervening regions separate visits, including a return to the same place',()=>{
  const records=[
    item(1,'2026-08-01'),item(2,'2026-08-01'),item(3,'2026-08-02'),
    item(4,'2026-08-06'),item(5,'2026-08-06'),item(6,'2026-08-07'),
    item(7,'2026-08-08','KR-26'),item(8,'2026-08-08','KR-26'),item(9,'2026-08-09','KR-26'),
    item(10,'2026-08-10'),item(11,'2026-08-10'),item(12,'2026-08-11'),
  ];
  const trips=discoverTrips(records);
  assert.deepEqual(trips.map(t=>t.regionCode),['KR-49','KR-26','KR-49','KR-49']);
  assert.deepEqual(trips.map(t=>t.items.map(i=>i.id)),[['10','11','12'],['7','8','9'],['4','5','6'],['1','2','3']]);
});

test('gap boundary is inclusive, but 1–2 records and small single-day sets never produce noisy trips',()=>{
  assert.equal(TRIP_MAX_DAY_GAP,3); assert.equal(TRIP_MIN_MEDIA,3); assert.equal(TRIP_SINGLE_DAY_MIN_MEDIA,10);
  assert.equal(discoverTrips([item(1,'2026-08-01'),item(2,'2026-08-02')]).length,0);
  assert.equal(discoverTrips([item(1,'2026-08-01'),item(2,'2026-08-01'),item(3,'2026-08-04')]).length,1);
  assert.equal(discoverTrips([item(1,'2026-08-01'),item(2,'2026-08-01'),item(3,'2026-08-05')]).length,0);
  assert.equal(discoverTrips(Array.from({length:9},(_,i)=>item(i,'2026-08-01'))).length,0);
  assert.equal(discoverTrips(Array.from({length:10},(_,i)=>item(i,'2026-08-01'))).length,1);
});

test('unknown locations interrupt visits; undated, invalid and audio records do not fabricate candidates',()=>{
  assert.equal(discoverTrips([
    item(1,'2026-08-01'),item(2,'2026-08-01'),item(3,'2026-08-02','unknown'),item(4,'2026-08-03'),
  ]).length,0);
  assert.equal(discoverTrips([item(1,null),item(2,'2026-02-30'),item(3,'not-a-date'),item(4,'2026-08-01','KR-49','audio')]).length,0);
  assert.equal(discoverTrips([item(1,'2026-08-01','__proto__'),item(2,'2026-08-01','__proto__'),item(3,'2026-08-02','__proto__')]).length,0);
  assert.equal(discoverTrips([]).length,0);
});

test('local date boundaries, leap days, manual regions and video-only covers are supported',()=>{
  const records=[item(1,'2024-02-28T23:00:00-12:00','KR-11','video'),item(2,'2024-02-29T01:00:00+14:00','KR-11','video'),
    {...item(3,'2024-03-01','KR-11','video'),locationSource:'manual'}];
  const [trip]=discoverTrips(records);
  assert.equal(trip.start,'2024-02-28'); assert.equal(trip.end,'2024-03-01');
  assert.equal(trip.photos,0); assert.equal(trip.videos,3); assert.strictEqual(trip.cover,records[0]);
  assert.equal(chooseTripCover([]),undefined);
  const crossYear=discoverTrips([item(1,'2025-12-31'),item(2,'2026-01-01'),item(3,'2026-01-02')]);
  assert.equal(crossYear.length,1); assert.equal(crossYear[0].title,'2025년 겨울 제주');
});

test('same-day region transitions respect timestamps and deterministically break candidates',()=>{
  const trips=discoverTrips([
    item(2,'2026-08-01T10:00:00'),item(1,'2026-08-01T09:00:00'),
    item(3,'2026-08-01T11:00:00','KR-26'),item(4,'2026-08-02T09:00:00'),
  ]);
  assert.equal(trips.length,0);
});
