import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOwnCommand} from '../scripts/own-character-input.mjs';
import {ownReplyMode} from '../scripts/own-reply-policy.mjs';
test('PC quiet policy follows Home without suppressing plants or explicit comfort commands',()=>{
 for(const affection of [0,19,20,29,30,59])assert.equal(ownReplyMode(parseOwnCommand(`터치 ${affection} 잠`)),'nonverbal');
 for(const affection of [60,89,90,100])assert.equal(ownReplyMode(parseOwnCommand(`터치 ${affection}`)),'spoken');
 assert.equal(ownReplyMode(parseOwnCommand('추워 20')),'spoken');
 assert.equal(ownReplyMode(parseOwnCommand('아파 20')),'spoken');
 assert.equal(ownReplyMode(parseOwnCommand('터치 20','potato')),'spoken');
});
test('PC Korean commands distinguish ordinary sleep from exhaustion and meals from snacks',()=>{
 assert.deepEqual(parseOwnCommand('간식 75 잠'),{characterId:'gomi',action:'treat',affection:75,condition:'normal',sleeping:true,mood:'sleepy',energy:1,previous:[]});
 assert.equal(parseOwnCommand('간식 75 피곤').energy,0);
 assert.equal(parseOwnCommand('밥 95 잠').action,'meal');
 assert.equal(parseOwnCommand('treat 75 sleep').energy,1);
 assert.equal(parseOwnCommand('터치 25 awake').sleeping,false);
 assert.throws(()=>parseOwnCommand('간식 75 unknown'),/상태는/);
});
