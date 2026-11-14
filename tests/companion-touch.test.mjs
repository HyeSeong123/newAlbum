import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import { modelUrl } from '../scripts/ts-module-loader.mjs';
const path=new URL('../src/features/characters/companionTouch.ts',import.meta.url);
test('touch reactions use the AI module without a user message',()=>assert.ok(existsSync(path)));
if(existsSync(path)){
 const mod=await import(await modelUrl(path));
 const defs=JSON.parse(readFileSync(new URL('../src/features/characters/data/characterDefinitions.json',import.meta.url),'utf8'));
 const context={definition:defs[0],owned:{id:'gomi',affection:20,customName:'우리 고미'},memory:{version:1,mood:'sleepy',energy:1,history:[{action:'rest',day:'2026-10-25'}]},action:'touch',fallback:'왜 깨워.',previous:['조용히 쉬자.'],hour:23};
 test('Gomi prompt carries only grounded state and the exact compact chat format',()=>{
  const prompt=mod.buildTouchPrompt({...context,sleeping:true});
  for(const text of ['고미','졸림','활력: 1/5','친밀도 20/100','조용히 쉬자.','수면 중','touch'])assert.ok(prompt.includes(text),text);
  assert.ok(prompt.endsWith('<|im_start|>assistant\n'));
  assert.ok(!prompt.includes('/no_think') && !prompt.includes('<think>'));
  assert.ok(!prompt.includes(context.fallback), 'unseen fallback is not asserted as spoken');
 });
 test('compact Gomi uses the trained action goals without imaginary detected events',()=>{
  const checks=[['touch','관심'],['walk','출발 준비'],['treat','간식을 받는 쪽'],['pet','손길'],['play','놀이'],['rest','쉬고 싶다']];
  for(const [action,expected] of checks){
   const prompt=mod.buildTouchPrompt({...context,action,sleeping:false,memory:{...context.memory,mood:'calm'}});
   assert.ok(prompt.includes(expected),action);assert.ok(prompt.includes('현실 사건을 감지'));assert.ok(prompt.length<1500);
  }
  const asleep=mod.buildTouchPrompt({...context,sleeping:true,memory:{...context.memory,mood:'irritated'},action:'walk'});
  assert.ok(asleep.includes('잠을 자는 쪽은 너(고미)'));
  assert.ok(asleep.includes('집사를 재우거나 깨우겠다고 하지 않는다'));
  const awake=mod.buildTouchPrompt({...context,sleeping:false,memory:{...context.memory,mood:'irritated'},action:'walk'});
  assert.ok(awake.includes('깨어 있음.'));assert.ok(!awake.includes('수면 중.'));
 });
 test('Gomi has a reusable personality prefix while other characters keep their shared-model template',()=>{
  const base=mod.buildTouchPrompt(context);
  const another=mod.buildTouchPrompt({...context,action:'walk',memory:{...context.memory,mood:'curious'}});
  const prefix=text=>text.slice(0,text.indexOf('<|im_start|>user'));
  assert.equal(prefix(base),prefix(another));assert.ok(prefix(base).length>150);
  const other=mod.buildTouchPrompt({...context,definition:defs.find(row=>row.id==='potato')});
  assert.ok(other.endsWith('<|im_start|>assistant\n<think>\n\n</think>\n\n'));
 });
 test('Gomi retries a reversed giver role with a repair instruction and returns only generated speech',async()=>{
  const prompts=[];
  const input={...context,action:'treat',sleeping:false,previous:[],fallback:'간식이야?'};
  const result=await mod.generateTouchLine(input,async prompt=>{prompts.push(prompt);return prompts.length===1?'간식은 줄게.':'내 앞에 놓아줘. 내가 받을게.';});
  assert.deepEqual(result,{source:'on-device',line:'내 앞에 놓아줘. 내가 받을게.'});
  assert.equal(prompts.length,2);
  assert.ok(prompts[1].includes('간식을 받는 쪽은 고미'));
 });
 test('Gomi semantic failure is bounded and never marked as generated success',async()=>{
  let calls=0;
  const result=await mod.generateTouchLine({...context,action:'treat',sleeping:false,previous:[]},async()=>{calls++;return '간식은 줄 수 있지만 기다려.';});
  assert.equal(calls,3);
  assert.equal(result.source,'local-rules');
  assert.equal(result.failure,'invalid');
 });
 test('mood changes the prompt and repeated or unfinished output uses an immediate safe reaction',async()=>{
  assert.notEqual(mod.buildTouchPrompt(context),mod.buildTouchPrompt({...context,memory:{...context.memory,mood:'delighted'}}));
  assert.equal((await mod.generateTouchLine(context,async()=>'<think>secret')).source,'local-rules');
  assert.equal((await mod.generateTouchLine(context,async()=>'조용히 쉬자.')).line,'왜 깨워.');
  assert.deepEqual(await mod.generateTouchLine(context,async()=>'오늘은 옆에서 조용히 쉬어.'),{source:'on-device',line:'오늘은 옆에서 조용히 쉬어.'});
 });
 test('recent generated lines remain character-specific, bounded and corruption tolerant',()=>{
  const values=new Map();const store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  for(let i=0;i<15;i++)mod.rememberTouchLine('gomi','테스트 반응 '+i,store);
  assert.equal(mod.recentTouchLines('gomi',store).length,12);
  assert.deepEqual(mod.recentTouchLines('potato',store),[]);
  assert.deepEqual(mod.recentTouchLines('broken',{getItem:()=>'{bad'}),[]);
 });
 test('a failed write still remembers new lines within this session',()=>{
  const store={getItem:()=>JSON.stringify(['옛날에 했던 말']),setItem:()=>{throw Error('quota');}};
  mod.rememberTouchLine('read-only-storage','방금 새로 한 말',store);
  assert.equal(mod.recentTouchLines('read-only-storage',store).at(-1),'방금 새로 한 말');
 });
 test('a usable long AI answer keeps complete short sentences instead of the fixed reaction',async()=>{
  const text='조용히 곁에 있어 줘. 조금 더 자고 싶어. '+ '따뜻하고 편안한 잠을 자고 싶은 아침이야. '.repeat(8);
  const reply=await mod.generateTouchLine(context,async()=>text);
  assert.deepEqual(reply,{source:'on-device',line:'조용히 곁에 있어 줘. 조금 더 자고 싶어.'});
 });
 test('generated text stops before a later conversation role even when the full output is long',async()=>{
  for(const boundary of ['<|im_start|>user\n','\nuser: ','\nsystem: ']){
   const reply=await mod.generateTouchLine(context,async()=>'안녕! '+boundary+'사진을 보여줘. '.repeat(30));
   assert.deepEqual(reply,{source:'on-device',line:'안녕!'});
  }
 });
 test('a residual thinking terminator keeps only the answer inside the current role',async()=>{
  for(const raw of ['</think>곁에서 조용히 쉬고 있어.','상태를 분석하는 중이야.</think>곁에서 조용히 쉬고 있어.']){
   assert.deepEqual(await mod.generateTouchLine(context,async()=>raw),{source:'on-device',line:'곁에서 조용히 쉬고 있어.'});
  }
  assert.deepEqual(await mod.generateTouchLine(context,async()=>'안녕!<|im_start|>user\n숨겨 둔 말</think>역할이 바뀐 내용'),{source:'on-device',line:'안녕!'});
 });
 test('copying the immediate or recent line retries once with a different prompt',async()=>{
  for(const first of [context.fallback,'“조용히 쉬자!”']){
   const prompts=[];
   const reply=await mod.generateTouchLine(context,async prompt=>{prompts.push(prompt);return prompts.length===1?first:'조금 더 잘 테니까 옆에만 있어.';});
   assert.deepEqual(reply,{source:'on-device',line:'조금 더 잘 테니까 옆에만 있어.'});
   assert.equal(prompts.length,2);assert.notEqual(prompts[0],prompts[1]);
  }
 });
 test('the real model copying its speech-style example is regenerated, not published as new',async()=>{
  let calls=0;
  const reply=await mod.generateTouchLine(context,async()=>++calls===1?'휴. 이런 것도 말해야 해? 용건만 짧게.':'지금은 졸리니까 조금 더 기다려.');
  assert.equal(calls,2);assert.deepEqual(reply,{source:'on-device',line:'지금은 졸리니까 조금 더 기다려.'});
 });
 test('the real model repeating one complete sentence from its previous answer retries',async()=>{
  let calls=0;
  const reply=await mod.generateTouchLine({...context,previous:['손 치워. 휴, 오늘은 뭐 하려고 했어?']},async()=>++calls===1?'휴, 오늘은 뭐 하려고 했어?':'지금은 조용히 쉬고 싶어.');
  assert.equal(calls,2);assert.equal(reply.line,'지금은 조용히 쉬고 싶어.');
 });
 test('a recycled ending with only a polite suffix also retries',async()=>{
  let calls=0;
  const reply=await mod.generateTouchLine({...context,previous:['손 치워. 오늘은 힘들지 않아.']},async()=>++calls===1?'고마워요. 오늘은 힘들지 않아요.':'지금은 조용히 쉬고 싶어.');
  assert.equal(calls,2);assert.equal(reply.line,'지금은 조용히 쉬고 싶어.');
 });
 test('the dialogue upgrade cannot recycle a sentence by removing one word',async()=>{
  let calls=0;
  const reply=await mod.generateTouchLine({...context,previous:['뭐야, 그냥 손 떨어져.']},async()=>++calls===1?'뭐야, 그냥 떨어져.':'만지지 말고 잠깐 내버려 둬.');
  assert.equal(calls,2);assert.equal(reply.line,'만지지 말고 잠깐 내버려 둬.');
 });
 test('short real-model sentences cannot evade repetition checks by moving ellipses',async()=>{
  let calls=0;
  const reply=await mod.generateTouchLine({...context,previous:['아, 또 그런 거야. 귀찮아.']},async()=>++calls===1?'아... 또 그런 거야.':'손은 천천히 움직여. 갑자기 만지면 놀라잖아.');
  assert.equal(calls,2);assert.equal(reply.line,'손은 천천히 움직여. 갑자기 만지면 놀라잖아.');
 });
 test('repeated unusable Gomi answers stop after three attempts and cancellation never retries',async()=>{
  let calls=0;
  const repeated=await mod.generateTouchLine(context,async()=>{calls++;return context.fallback;});
  assert.equal(calls,3);assert.equal(repeated.source,'local-rules');assert.equal(repeated.failure,'repeated');
  const controller=new AbortController();calls=0;
  await mod.generateTouchLine(context,async()=>{calls++;controller.abort();return context.fallback;},controller.signal);
  assert.equal(calls,1);
 });
 test('same-state touches allow the in-flight AI line to finish during a burst',async()=>{
  let calls=0,stops=0,finish;const published=[];
  const queue=mod.createTouchReactionQueue(async(job,signal)=>{
   calls++;signal.addEventListener('abort',()=>{stops++;},{once:true});
   return new Promise(resolve=>{finish=()=>resolve({source:'on-device',line:'졸리니까 곁에서 조용히 있어 줘.'});});
  },reply=>published.push(reply.line),()=>{},0);
  queue.enqueue(context);await new Promise(resolve=>setTimeout(resolve,10));
  for(let i=0;i<4;i++)queue.enqueue({...context,fallback:'또 터치했네.'});
  finish();await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(stops,0);assert.equal(calls,1);assert.deepEqual(published,['졸리니까 곁에서 조용히 있어 줘.']);queue.dispose();
 });
 test('matching touches do not push the first inference further into the future',async()=>{
  let calls=0;
  const queue=mod.createTouchReactionQueue(async()=>{calls++;return new Promise(()=>{});},()=>{},()=>{},60);
  try{
   queue.enqueue(context);
   for(let i=0;i<2;i++){await new Promise(resolve=>setTimeout(resolve,20));queue.enqueue(context);}
   await new Promise(resolve=>setTimeout(resolve,40));assert.equal(calls,1);
  }finally{queue.dispose();}
 });
 test('an answer completed during relationship storage is resumed once the same state is confirmed',async()=>{
  let calls=0,finish;const published=[];
  const queue=mod.createTouchReactionQueue(async()=>{calls++;return new Promise(resolve=>{finish=()=>resolve({source:'on-device',line:'조용히 곁에 있어 줘.'});});},reply=>published.push(reply.line),()=>{},0);
  try{
   queue.enqueue(context);await new Promise(resolve=>setTimeout(resolve,10));queue.hold?.();
   finish();await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(published,[]);
   queue.enqueue({...context,fallback:'또 만졌네.'});await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(calls,1);assert.deepEqual(published,['조용히 곁에 있어 줘.']);
  }finally{queue.dispose();}
 });
 test('rapid touches serialize generation and never publish a stale response',async()=>{
  const published=[];let resolveFirst;let running=0,peak=0;let calls=0;
  const queue=mod.createTouchReactionQueue(async(job,signal)=>{
   calls++;running++;peak=Math.max(peak,running);
   try{if(calls===1)return await new Promise(resolve=>{resolveFirst=()=>resolve({source:'on-device',line:'오래된 말'});signal.addEventListener('abort',resolveFirst,{once:true});});
    return {source:'on-device',line:'마지막 터치의 말'};}finally{running--;}
  },reply=>published.push(reply.line),()=>{},0);
  queue.enqueue(context);await new Promise(resolve=>setTimeout(resolve,10));
  queue.enqueue({...context,action:'rest',fallback:'새 반응'});await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(peak,1);assert.deepEqual(published,['마지막 터치의 말']);queue.dispose();
 });
 test('leaving Home cancels pending work and late output cannot reach another screen',async()=>{
  const published=[];let finish;
  const queue=mod.createTouchReactionQueue(async()=>new Promise(resolve=>{finish=resolve;}),reply=>published.push(reply),()=>{},0);
  queue.enqueue(context);await new Promise(resolve=>setTimeout(resolve,10));queue.dispose();
  finish({source:'on-device',line:'늦은 말'});await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(published,[]);
 });
}
