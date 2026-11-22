import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {modelUrl} from './ts-module-loader.mjs';
import {parseOwnCommand} from './own-character-input.mjs';
import {ownReplyMode} from './own-reply-policy.mjs';

const {loadOwnModel,generateOwnLine}=await import(await modelUrl(new URL('../src/features/characters/ownAi/engine.ts',import.meta.url)));
const index=process.argv.indexOf('--character');
const selected=process.argv[index+1];
const characterId=index<0?'gomi':selected==='dorongi'?'apple':selected;
const modelFile=characterId==='apple'?'dorongi.json':'model.json';
const rawBytes=await readFile(new URL('../src/features/characters/ownAi/'+modelFile,import.meta.url));
const raw=JSON.parse(rawBytes);
const model=loadOwnModel(raw);
if(process.argv.includes('--info')){
 console.log(JSON.stringify({model:'곰고미 전용 AI',id:'own-character-v3',format:raw.format,bytes:rawBytes.length,parameters:raw.provenance.parameters,
   initialization:raw.provenance.initialization,pretrainedParents:raw.provenance.pretrainedParents,characters:model.characters,actions:model.actions},null,2));
}else{
 const once=process.argv.indexOf('--once');
 if(once>=0){
   const input=parseOwnCommand(process.argv[once+1],characterId),started=performance.now();
   const source=ownReplyMode(input);
   console.log(JSON.stringify({input,source,line:source==='nonverbal'?'':generateOwnLine(model,input),inferenceRequested:source!=='nonverbal',elapsedMs:performance.now()-started}));
 }else{
 const cli=createInterface({input:stdin,output:stdout});
 const previous=[];
 console.log('곰고미 전용 AI · 외부 모델/API 없이 직접 생성합니다.');
 if(characterId==='apple')console.log('도롱이 입력: 터치 / 장기 / 막걸리 / 첫만남 / 편지 / 작별 / 갓 / 붓글씨, 친밀도(0–100) · 종료: exit');
 else console.log('입력: 터치 / 산책 / 간식 / 밥 / 쓰다듬기 / 놀기 / 쉬기, 친밀도(0–100), awake / 잠 / 피곤 · 종료: exit');
 try{while(true){
   const text=(await cli.question('행동> ')).trim();if(text==='exit'||text==='0')break;if(!text)continue;
   const started=performance.now();
   try{
     const input=parseOwnCommand(text,characterId,previous);
     if(ownReplyMode(input)==='nonverbal'){console.log('고미는 대꾸하지 않고 조용히 눈길을 돌립니다.');continue;}
     const line=generateOwnLine(model,input);
     console.log(`${line}  (${(performance.now()-started).toFixed(1)}ms)`);previous.push(line);if(previous.length>24)previous.shift();
   }catch(error){console.error(String(error));}
 }}finally{cli.close();}
 }
}
