import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnTimings} from '../scripts/gomi-action-smoke.mjs';

test('full-response performance gate rejects late output and fast fallback/error',()=>{
 const reply={source:'on-device',line:'집사, 내 옆에 있어.',elapsedMs:200};
 assert.equal(assertOwnTimings([reply,{...reply,elapsedMs:400}]).maxMs,400);
 assert.throws(()=>assertOwnTimings([{...reply,elapsedMs:1001}]),/target/);
 assert.throws(()=>assertOwnTimings([{...reply,source:'local-rules',elapsedMs:1}]),/fallback/);
 assert.throws(()=>assertOwnTimings([]),/complete visible reply/);
});
