import test from 'node:test';
import assert from 'node:assert/strict';
import {reactionIssues} from '../scripts/own-reaction-quality.mjs';

test('semantic gate catches the reported sleep/food/play hybrid and preserves natural implicit requests',()=>{
 const state={characterId:'gomi',action:'treat',sleeping:true,energy:1,affection:75};
 assert.ok(reactionIssues(state,'나 졸리단 말이야. 조금만 더 같이 해볼까?').includes('food-play-hybrid'));
 assert.ok(reactionIssues({...state,energy:0},'지금 먹으러 갈게.').includes('exhausted-wakes-to-eat'));
 assert.deepEqual(reactionIssues({...state,energy:0},'간식은 깬 다음에 먹을게.'),[]);
 assert.deepEqual(reactionIssues({...state,energy:0},'집사, 나 조금 더 자도 되지?'),[]);
 assert.ok(reactionIssues({...state,energy:0},'조금 더 자도 돼? 지금 먹으러 갈게.').includes('exhausted-wakes-to-eat'));
 assert.deepEqual(reactionIssues({...state,action:'meal',energy:0},'밥은 옆에 놔둬.'),[]);
 assert.deepEqual(reactionIssues({...state,action:'pet',sleeping:false},'천천히 해.'),[]);
});
import {assertOwnTimings,assertOwnAssets,assertQuietReactions} from '../scripts/gomi-action-smoke.mjs';

test('quiet outcomes require no spoken line, low saved affection and no inference request',()=>{
 const quiet={source:'nonverbal',line:'',elapsedMs:140,affection:20,inferenceRequested:false,responseId:'2',previousResponseId:'1'};
 assert.equal(assertQuietReactions([quiet]).samples,1);
 assert.throws(()=>assertQuietReactions([{...quiet,source:'local-rules'}]));
 assert.throws(()=>assertQuietReactions([{...quiet,line:'귀찮아.'}]));
 assert.throws(()=>assertQuietReactions([{...quiet,affection:60}]));
 assert.throws(()=>assertQuietReactions([{...quiet,inferenceRequested:true}]));
 assert.throws(()=>assertQuietReactions([{...quiet,responseId:'1'}]));
});

test('full-response performance gate rejects late output and fast fallback/error',()=>{
 const reply={source:'on-device',line:'집사, 내 옆에 있어.',elapsedMs:200};
 assert.equal(assertOwnTimings([reply,{...reply,elapsedMs:400}]).maxMs,400);
 assert.throws(()=>assertOwnTimings([{...reply,elapsedMs:1001}]),/target/);
 assert.throws(()=>assertOwnTimings([{...reply,source:'local-rules',elapsedMs:1}]),/fallback/);
 assert.throws(()=>assertOwnTimings([]),/complete visible reply/);
});
test('served frontend byte proof rejects wrong weights, stale notices and pretrained parents',()=>{
 const expected={modelSha256:'source-sha',modelBytes:100,noticeSha256:'notice-sha'};
 const proof={...expected,manifest:{id:'own-character-v3',sha256:'source-sha',bytes:100},initialization:'random',pretrainedParents:[],teacherModel:null};
 assertOwnAssets(proof,expected);
 assert.throws(()=>assertOwnAssets({...proof,modelSha256:'other-model'},expected),/source weights/);
 assert.throws(()=>assertOwnAssets({...proof,noticeSha256:'stale-notice'},expected),/source notice/);
 assert.throws(()=>assertOwnAssets({...proof,pretrainedParents:['foreign-base']},expected));
});
