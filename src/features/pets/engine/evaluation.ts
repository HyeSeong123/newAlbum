import { recognizePet } from './matcher';
import { ENGINE_VERSION,type PetFeatures,type PetView,type PetKind } from './types';
interface Sample {sampleId:string;captureGroup:string;sourceKey?:string;engineVersion?:string;petId:number|null;view:PetView;kind?:PetKind;features:PetFeatures|null}
interface Dataset {engineVersion?:string;references:Sample[];queries:Sample[]}
export function evaluatePets(data:Dataset){
 if(data.engineVersion && data.engineVersion!==ENGINE_VERSION)throw new Error('검증 자료의 엔진 버전이 다릅니다.');
 if(!Array.isArray(data.references)||!Array.isArray(data.queries))throw new Error('references/queries arrays are required');
 const groups=new Set<string>(),ids=new Set<string>(),sources=new Set<string>();
 const valid=(sample:Sample)=>{
  if(!sample.sampleId||!sample.captureGroup||!(sample.petId===null||Number.isInteger(sample.petId)&&sample.petId>0)||!['front','left','right','rear','unknown'].includes(sample.view))throw new Error('Sample requires sampleId, captureGroup, ground-truth view and petId');
  if(sample.kind && !['dog','cat'].includes(sample.kind))throw new Error('Ground-truth kind must be dog or cat');
  if(sample.engineVersion && sample.engineVersion!==ENGINE_VERSION)throw new Error('Mixed feature engine versions');
  const f=sample.features;
  if(f && (!['dog','cat'].includes(f.kind) || ![f.appearance,f.mirroredAppearance,f.color,f.shape,f.faceAppearance??[],f.mirroredFaceAppearance??[]].every(vector=>Array.isArray(vector)&&vector.every(Number.isFinite)) || ![0,1024].includes(f.appearance.length) || ![0,1024].includes(f.mirroredAppearance.length) || ![0,1024].includes(f.faceAppearance?.length??0) || ![0,1024].includes(f.mirroredFaceAppearance?.length??0) || f.color.length!==120 || f.shape.length!==10))throw new Error('Invalid extracted feature dimensions or values');
 };
 for(const reference of data.references){valid(reference);if(reference.petId===null||!reference.features||ids.has(reference.sampleId))throw new Error('Reference requires a known pet, features and unique sampleId');if(reference.kind && reference.features.kind!==reference.kind)throw new Error('Correct reference species before evaluation');groups.add(reference.captureGroup);ids.add(reference.sampleId);if(reference.sourceKey)sources.add(reference.sourceKey);}
 const refs=data.references.map(r=>({petId:r.petId!,features:r.features!}));
 const stats={all:{total:0,correct:0},front:{total:0,correct:0},side:{total:0,correct:0},left:{total:0,correct:0},right:{total:0,correct:0},rear:{total:0,candidateHit:0},novel:{total:0,suggestedKnown:0},detectionMisses:0,species:{total:0,correct:0},humanSpeciesCorrections:0,unresolved:0};
 const sidePets=new Set<number>(),sidePhotos=new Set<string>(),sideSpecies=new Set<string>();
 const modelSpeciesStats={all:{total:0,correct:0},front:{total:0,correct:0},side:{total:0,correct:0}};
 let originalSpeciesAvailable=true;
 for(const query of data.queries){
  valid(query);
  if(ids.has(query.sampleId)||groups.has(query.captureGroup)||(query.sourceKey && sources.has(query.sourceKey)))throw new Error('Enrollment/query overlap or duplicate: '+query.sampleId);
  ids.add(query.sampleId);
  if(!query.kind || query.features && !query.features.detectedKind)originalSpeciesAvailable=false;
  if(!query.features)stats.detectionMisses++;
  if(query.features && query.kind){stats.species.total++;if((query.features.detectedKind??query.features.kind)===query.kind)stats.species.correct++;if(query.features.detectedKind && query.features.detectedKind!==query.features.kind)stats.humanSpeciesCorrections++;}
  // A mistaken species prediction counts as an end-to-end identification miss.
  const result=query.features && (!query.kind || query.features.kind===query.kind)?recognizePet({...query.features,view:query.view},refs):{candidates:[]};
  const candidates=result.candidates;stats.unresolved++;
  if(query.petId===null){stats.novel.total++;if(candidates.length)stats.novel.suggestedKnown++;continue;}
  if(query.view==='rear'){stats.rear.total++;if(candidates.some(c=>c.petId===query.petId))stats.rear.candidateHit++;continue;}
  const correct=Number(candidates[0]?.petId===query.petId);stats.all.total++;stats.all.correct+=correct;
  const modelCorrect=Number(!!correct && query.features?.detectedKind===query.kind);
  modelSpeciesStats.all.total++;modelSpeciesStats.all.correct+=modelCorrect;
  if(query.view==='front'){stats.front.total++;stats.front.correct+=correct;}
  if(query.view==='front'){modelSpeciesStats.front.total++;modelSpeciesStats.front.correct+=modelCorrect;}
  if(query.view==='left'||query.view==='right'){stats.side.total++;stats.side.correct+=correct;stats[query.view].total++;stats[query.view].correct+=correct;sidePets.add(query.petId);sidePhotos.add(query.sourceKey??query.sampleId);if(query.kind)sideSpecies.add(query.kind);}
  if(query.view==='left'||query.view==='right'){modelSpeciesStats.side.total++;modelSpeciesStats.side.correct+=modelCorrect;}
 }
 const accuracy=({total,correct}:{total:number;correct:number})=>total?correct/total:null;
 const sufficient=originalSpeciesAvailable && stats.side.total>=100 && sidePhotos.size>=100 && sidePets.size>=10 && stats.left.total>=25 && stats.right.total>=25 && sideSpecies.size===2;
 const p=originalSpeciesAvailable?accuracy(modelSpeciesStats.side):null,n=stats.side.total,z=1.96;
 const interval=p===null?null:[Math.max(0,(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n)),Math.min(1,(p+z*z/(2*n)+z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n))];
 return {engineVersion:ENGINE_VERSION,enrollmentCount:data.references.length,queryCount:data.queries.length,stats,top1IdentificationAccuracy:{overall:accuracy(stats.all),front:accuracy(stats.front),side:accuracy(stats.side),left:accuracy(stats.left),right:accuracy(stats.right)},originalSpeciesAvailable,modelSpeciesTop1Accuracy:originalSpeciesAvailable?{overall:accuracy(modelSpeciesStats.all),front:accuracy(modelSpeciesStats.front),side:accuracy(modelSpeciesStats.side)}:null,sideAccuracyWilson95:interval,sideGoalReached:sufficient?accuracy(modelSpeciesStats.side)!>=0.6:null,sideDataSufficient:sufficient,sideUniquePets:sidePets.size,sideUniquePhotos:sidePhotos.size,rearTop3Recall:stats.rear.total?stats.rear.candidateHit/stats.rear.total:null,automaticLinkingEnabled:false,automaticLinkFalseRate:null,novelPetAutomaticFalseLinkRate:null,novelPetKnownSuggestionRate:stats.novel.total?stats.novel.suggestedKnown/stats.novel.total:null,unresolvedRate:data.queries.length?stats.unresolved/data.queries.length:null,note:'User-labeled view and optional user-selected face regions. top1IdentificationAccuracy uses corrected species; modelSpeciesTop1Accuracy counts original species errors as misses. Side goal uses modelSpeciesTop1Accuracy. No automatic pose or automatic-link trials. Same-session/content overlap is rejected; near-duplicate sessions require manual audit.'};
}
