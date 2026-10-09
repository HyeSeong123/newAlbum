import {readFile} from 'node:fs/promises';
import {modelUrl} from '../tests/model-loader.mjs';
const {recognizePet}=await import(await modelUrl('features/pets/engine/matcher.ts'));
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/evaluate-pets.mjs /path/to/held-out-features.json');
const data=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(data.references)||!Array.isArray(data.queries))throw new Error('references/queries arrays are required');
const groups=new Set(),ids=new Set();
for(const reference of data.references){
 if(!reference.sampleId||!reference.captureGroup||!Number.isInteger(reference.petId)||!reference.features)throw new Error('Reference requires sampleId, captureGroup, petId and features');
 groups.add(reference.captureGroup);ids.add(reference.sampleId);
}
const stats={all:{total:0,correct:0},front:{total:0,correct:0},side:{total:0,correct:0},rear:{total:0,candidateHit:0},novel:{total:0,suggestedKnown:0},unresolved:0};
const queryIds=new Set();
for(const query of data.queries){
 if(!query.sampleId||!query.captureGroup||!['front','left','right','rear','unknown'].includes(query.view)||!(query.petId===null||Number.isInteger(query.petId)))throw new Error('Query requires sampleId, captureGroup, ground-truth view and petId (null for novel)');
 if(ids.has(query.sampleId)||queryIds.has(query.sampleId)||groups.has(query.captureGroup))throw new Error('Enrollment/query overlap or duplicate: '+query.sampleId);
 queryIds.add(query.sampleId);
 const result=query.features?recognizePet({...query.features,view:query.view},data.references):{candidates:[]};
 const candidates=result.candidates;
 stats.unresolved++;// All outcomes still need human confirmation in this version.
 if(query.petId===null){stats.novel.total++;if(candidates.length)stats.novel.suggestedKnown++;continue;}
 if(query.view==='rear'){stats.rear.total++;if(candidates.some(c=>c.petId===query.petId))stats.rear.candidateHit++;continue;}
 const correct=Number(candidates[0]?.petId===query.petId);
 stats.all.total++;stats.all.correct+=correct;
 const direction=query.view==='front'?stats.front:query.view==='left'||query.view==='right'?stats.side:null;
 if(direction){direction.total++;direction.correct+=correct;}
}
const accuracy=({total,correct})=>total?correct/total:null;
console.log(JSON.stringify({engineVersion:'gamjassak-pets-v1',enrollmentCount:data.references.length,queryCount:data.queries.length,stats,
 top1IdentificationAccuracy:{overall:accuracy(stats.all),front:accuracy(stats.front),side:accuracy(stats.side)},
 sideGoalReached:stats.side.total>=100?accuracy(stats.side)>=0.6:null,
 automaticLinkingEnabled:false,automaticLinkFalseRate:null,novelPetAutomaticFalseLinkRate:null,
 novelPetKnownSuggestionRate:stats.novel.total?stats.novel.suggestedKnown/stats.novel.total:null,
 unresolvedRate:data.queries.length?stats.unresolved/data.queries.length:null,
 note:'Evaluation uses held-out extracted features; end-to-end detection misses must have features:null. Rear uses candidate recall, never identity accuracy. No auto-link trials were run.'},null,2));
