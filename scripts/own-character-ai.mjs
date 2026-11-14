import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {modelUrl} from './ts-module-loader.mjs';

const {loadOwnModel,generateOwnLine}=await import(await modelUrl(new URL('../src/features/characters/ownAi/engine.ts',import.meta.url)));
const rawBytes=await readFile(new URL('../src/features/characters/ownAi/model.json',import.meta.url));
const raw=JSON.parse(rawBytes);
const model=loadOwnModel(raw);
if(process.argv.includes('--info')){
 console.log(JSON.stringify({model:'곰고미 전용 AI',bytes:rawBytes.length,parameters:raw.provenance.parameters,
   initialization:raw.provenance.initialization,pretrainedParents:raw.provenance.pretrainedParents,characters:model.characters,actions:model.actions},null,2));
}else{
 const index=process.argv.indexOf('--character');
 const characterId=index>=0?process.argv[index+1]:'gomi';
 const cli=createInterface({input:stdin,output:stdout});
 const previous=[];
 console.log('곰고미 전용 AI · 외부 모델/API 없이 직접 생성합니다.');
 console.log('입력: touch / walk / treat / pet / play / rest, 친밀도(0–100), awake 또는 sleep');
 console.log('예: treat 80 awake / touch 20 sleep / cold 80 / unwell 80 · 종료: exit');
 try{while(true){
   const text=(await cli.question('행동> ')).trim();if(text==='exit'||text==='0')break;if(!text)continue;
   const [action,affection='45',state='awake']=text.split(/\s+/),condition=['cold','unwell'].includes(action)?action:'normal';
   const started=performance.now();
   try{
     const line=generateOwnLine(model,{characterId,action:condition==='normal'?action:'touch',affection:Number(affection),
       mood:state==='sleep'?'sleepy':'calm',energy:state==='sleep'?0:condition==='normal'?3:1,sleeping:state==='sleep',condition,previous});
     console.log(`${line}  (${(performance.now()-started).toFixed(1)}ms)`);previous.push(line);if(previous.length>12)previous.shift();
   }catch(error){console.error(String(error));}
 }}finally{cli.close();}
}
