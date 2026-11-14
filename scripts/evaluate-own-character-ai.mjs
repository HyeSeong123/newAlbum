import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {modelUrl} from './ts-module-loader.mjs';
const {loadOwnModel,generateOwnLine}=await import(await modelUrl(new URL('../src/features/characters/ownAi/engine.ts',import.meta.url)));
const raw=await readFile('src/features/characters/ownAi/model.json');const metadata=JSON.parse(raw),model=loadOwnModel(metadata);
const corpusBytes=await readFile('local-ai/own/corpus.json');
if(createHash('sha256').update(corpusBytes).digest('hex')!==metadata.provenance.sourceCorpusSha256)throw new Error('Training source digest mismatch');
const corpus=JSON.parse(corpusBytes),normalize=text=>text.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu,'');
const trainedLines=new Set(corpus.rows.map(row=>normalize(row.reply)));
const fixtures=[];
for(const action of model.actions)for(const affection of [5,45,85])fixtures.push({characterId:'gomi',action,affection,mood:'calm',energy:3,sleeping:false});
for(const action of ['touch','rest','treat'])for(const mood of ['sleepy','irritated'])fixtures.push({characterId:'gomi',action,affection:80,mood,energy:0,sleeping:true});
for(const condition of ['cold','unwell'])fixtures.push({characterId:'gomi',action:'touch',affection:80,mood:'calm',energy:1,sleeping:false,condition});
for(const characterId of ['potato','sweet-potato','jujube'])for(const action of ['touch','treat'])fixtures.push({characterId,action,affection:80,mood:action==='treat'?'delighted':'calm',energy:3,sleeping:false});
const records=fixtures.map((input,index)=>{
 const started=performance.now();try{const line=generateOwnLine(model,input,20261115+index*31);
  return {input,line,elapsedMs:performance.now()-started,exactTrainingLine:trainedLines.has(normalize(line))};
 }catch(error){return{input,error:String(error),elapsedMs:performance.now()-started};}
});
const successful=records.filter(row=>!row.error),times=successful.map(row=>row.elapsedMs).sort((a,b)=>a-b);
const report={modelBytes:raw.length,modelSha256:createHash('sha256').update(raw).digest('hex'),provenance:metadata.provenance,
 assessment:'Development diagnostic, not an independent human quality score or physical Galaxy26 timing',records,
 summary:{cases:records.length,successes:successful.length,errors:records.filter(row=>row.error).length,
  novelCombinations:successful.filter(row=>!row.exactTrainingLine).length,p50EngineMs:times[Math.floor((times.length-1)*0.5)],p95EngineMs:times[Math.ceil((times.length-1)*0.95)],maxEngineMs:times.at(-1)}};
await mkdir('test-results',{recursive:true});await writeFile('test-results/own-character-ai.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,records:records.map(({input,line,error,elapsedMs})=>({character:input.characterId,action:input.action,affection:input.affection,sleeping:input.sleeping,condition:input.condition,line,error,ms:+elapsedMs.toFixed(2)}))},null,2));
if(report.summary.errors||report.summary.maxEngineMs>=1000)process.exitCode=1;
