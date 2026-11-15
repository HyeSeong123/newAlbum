import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {modelUrl} from './ts-module-loader.mjs';
import {reactionIssues} from './own-reaction-quality.mjs';
const base=new URL('../',import.meta.url);
const {loadOwnModel,generateOwnLine,supportsOwnLine}=await import(await modelUrl(new URL('src/features/characters/ownAi/engine.ts',base)));
const raw=await readFile(new URL('src/features/characters/ownAi/model.json',base)),metadata=JSON.parse(raw),model=loadOwnModel(metadata);
const corpusBytes=await readFile(new URL('local-ai/own/corpus.json',base));
if(createHash('sha256').update(corpusBytes).digest('hex')!==metadata.provenance.sourceCorpusSha256)throw new Error('Training source digest mismatch');
const corpus=JSON.parse(corpusBytes),normalize=text=>text.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu,'');
const trainedLines=new Set(corpus.rows.map(row=>normalize(row.reply))),fixtures=[];
for(const action of model.actions)for(const affection of [5,25,45,75,95])for(const energy of [0,1,3])fixtures.push({characterId:'gomi',action,affection,mood:'calm',energy,sleeping:false});
for(const action of model.actions)for(const affection of [5,25,45,75,95])for(const energy of [0,1])for(const mood of ['sleepy','irritated'])fixtures.push({characterId:'gomi',action,affection,mood,energy,sleeping:true});
for(const condition of ['cold','unwell'])for(const affection of [5,25,45,75,95])fixtures.push({characterId:'gomi',action:'touch',affection,mood:'calm',energy:1,sleeping:false,condition});
for(const characterId of model.characters.filter(id=>id!=='gomi'))for(const action of ['touch','treat'])fixtures.push({characterId,action,affection:80,mood:action==='treat'?'delighted':'calm',energy:3,sleeping:false});
const records=[];
for(const [index,input] of fixtures.entries()){
 const previous=[];
 for(let repetition=0;repetition<12;repetition++){
  const started=performance.now(),state={...input,previous:[...previous]},seed=20261115+index*7919+repetition*37;
  try{
   const line=generateOwnLine(model,state,seed),issues=reactionIssues(input,line);
   if(!supportsOwnLine(model,input,line))issues.push('unsupported-learned-scene');
   if(previous.slice(-3).includes(line))issues.push('immediate-repeat');
   records.push({input,seed,line,issues,reusedOlderLine:previous.includes(line),elapsedMs:performance.now()-started,exactTrainingLine:trainedLines.has(normalize(line))});
   previous.push(line);if(previous.length>12)previous.shift();
  }catch(error){records.push({input,seed,error:String(error),issues:['generation-error'],elapsedMs:performance.now()-started});}
 }
}
const successful=records.filter(row=>!row.error),times=successful.map(row=>row.elapsedMs).sort((a,b)=>a-b);
const report={modelBytes:raw.length,modelSha256:createHash('sha256').update(raw).digest('hex'),provenance:metadata.provenance,
 assessment:'Developer synthetic scene/fatigue repetitions and semantic checks; not independent human approval or physical Galaxy26 timing',records,
 summary:{scenes:fixtures.length,cases:records.length,successes:successful.length,errors:records.filter(row=>row.error).length,
  semanticFailures:records.filter(row=>row.issues.length).length,novelCombinations:successful.filter(row=>!row.exactTrainingLine).length,
  p50EngineMs:times[Math.floor((times.length-1)*0.5)],p95EngineMs:times[Math.ceil((times.length-1)*0.95)],maxEngineMs:times.at(-1)}};
await mkdir(new URL('test-results/',base),{recursive:true});await writeFile(new URL('test-results/own-character-ai.json',base),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,issues:records.filter(row=>row.issues.length).slice(0,16),foodSamples:records.filter(row=>row.input.sleeping&&['treat','meal'].includes(row.input.action)&&row.input.affection===75).filter((_,index)=>index%12===0).slice(0,8)},null,2));
if(report.summary.errors||report.summary.semanticFailures||report.summary.maxEngineMs>=1000)process.exitCode=1;
