import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const {comparePets,rankPets,recognizePet,withView,cosine}=await import(await modelUrl('features/pets/engine/matcher.ts'));
const {cropDescriptors}=await import(await modelUrl('features/pets/engine/features.ts'));
const {conservativeViewAnalyzer}=await import(await modelUrl('features/pets/engine/types.ts'));
const feature=(patch={})=>({kind:'dog',view:'front',viewSource:'user',box:[0,0,1,1],detectionScore:0.99,appearance:[1,0],mirroredAppearance:[0,1],color:[1,0],shape:[1,0],...patch});
test('rear comparison ignores learned identity vectors on either side',()=>{
 const query=feature({view:'rear',appearance:[1,0],mirroredAppearance:[1,0]});
 const reference=feature({appearance:[0,1],mirroredAppearance:[0,1]});
 assert.deepEqual(comparePets(query,reference),{score:1,basis:'shape-color'});
 assert.equal(comparePets(feature(),feature({view:'rear'})).basis,'shape-color');
 assert.equal(recognizePet(query,[{petId:1,features:reference}]).autoPetId,null);
 assert.equal(recognizePet(query,[{petId:1,features:reference}]).state,'rear-review');
 assert.deepEqual(withView(query,'rear').appearance,[]);
});
test('exact front/side similarity cannot enable uncalibrated automatic linking',()=>{
 for(const view of ['front','left','right','unknown']) {
  const result=recognizePet(feature({view}),[{petId:1,features:feature()}]);
  assert.equal(result.candidates[0].petId,1);assert.equal(result.autoPetId,null);assert.equal(result.state,'needs-review');
 }
 assert.deepEqual(conservativeViewAnalyzer.analyze(),{view:'unknown',viewSource:'unknown'});
});
test('opposite side matching uses mirror embeddings and separates species',()=>{
 const query=feature({view:'left',appearance:[1,0],mirroredAppearance:[0,1]});
 const right=feature({view:'right',appearance:[0,1],mirroredAppearance:[0,1]});
 assert.equal(comparePets(query,right).score,1);
 assert.equal(comparePets(query,feature({kind:'cat'})).score,0);
});
test('candidate ranking is per pet, bounded and deterministic under ties',()=>{
 const refs=[{petId:2,features:feature()},{petId:1,features:feature()},{petId:1,features:feature()},{petId:3,features:feature({kind:'cat'})}];
 assert.deepEqual(rankPets(feature(),refs).map(x=>x.petId),[1,2]);
 assert.equal(rankPets(feature(),refs,1).length,1);
 assert.equal(recognizePet(feature(),[]).state,'unregistered');
});
test('malformed vectors never produce NaN or identity candidates',()=>{
 assert.equal(cosine([NaN],[1]),0);assert.equal(cosine([],[]),0);assert.equal(cosine([0],[0]),0);assert.equal(cosine([1],[1,2]),0);
 assert.equal(recognizePet(feature({appearance:[],mirroredAppearance:[]}),[{petId:1,features:feature()}]).candidates.length,0);
});
test('spatial color descriptors preserve color differences without pretrained face features',()=>{
 const red=new Uint8ClampedArray(8*8*4),blue=new Uint8ClampedArray(8*8*4);
 for(let i=0;i<red.length;i+=4){red[i]=255;red[i+3]=255;blue[i+2]=255;blue[i+3]=255;}
 const a=cropDescriptors(red,8,8,1),b=cropDescriptors(blue,8,8,1);
 assert.equal(a.color.length,120);assert.equal(a.shape.length,10);
 assert.ok(a.color.every(Number.isFinite));assert.ok(cosine(a.color,b.color)<0.8);
});
test('user-selected front face outweighs conflicting body appearance without enabling auto-link',()=>{
 const query=feature({faceAppearance:[1,0],mirroredFaceAppearance:[1,0]});
 const sameFace=feature({appearance:[0.6,0.8],mirroredAppearance:[0.6,0.8],faceAppearance:[1,0],mirroredFaceAppearance:[1,0]});
 const otherFace=feature({appearance:[1,0],mirroredAppearance:[1,0],faceAppearance:[0,1],mirroredFaceAppearance:[0,1]});
 const result=recognizePet(query,[{petId:2,features:otherFace},{petId:1,features:sameFace}]);
 assert.equal(result.candidates[0].petId,1);assert.equal(result.candidates[0].basis,'face-appearance');assert.equal(result.autoPetId,null);
 assert.equal(comparePets({...query,view:'rear'},otherFace).basis,'shape-color');
 assert.deepEqual(withView(query,'rear').faceAppearance,[]);assert.deepEqual(withView(query,'unknown').faceAppearance,[]);
});
test('a generic body reference cannot override the available face reference for the same pet',()=>{
 const query=feature({faceAppearance:[1,0],mirroredFaceAppearance:[1,0]});
 const references=[{petId:1,features:feature()},{petId:1,features:feature({faceAppearance:[0,1],mirroredFaceAppearance:[0,1]})}];
 assert.equal(rankPets(query,references)[0].basis,'face-appearance');assert.ok(rankPets(query,references)[0].score<0.5);
});
const {evaluatePets}=await import(await modelUrl('features/pets/engine/evaluation.ts'));
const realDimensions=()=>feature({appearance:[1,...Array(1023).fill(0)],mirroredAppearance:[1,...Array(1023).fill(0)],color:[1,...Array(119).fill(0)],shape:[1,...Array(9).fill(0)]});
const reference=()=>({sampleId:'r',captureGroup:'enroll',sourceKey:'hash1',petId:1,view:'front',kind:'dog',features:realDimensions()});
const query=(patch={})=>({sampleId:'q',captureGroup:'test',sourceKey:'hash2',petId:1,view:'left',kind:'dog',features:realDimensions(),...patch});
test('evaluation includes detector misses, unknown pets, rear recall and small-data abstention',()=>{
 const result=evaluatePets({references:[reference()],queries:[query(),query({sampleId:'miss',sourceKey:'hash3',features:null}),query({sampleId:'rear',sourceKey:'hash4',view:'rear'}),query({sampleId:'novel',sourceKey:'hash5',petId:null})]});
 assert.equal(result.top1IdentificationAccuracy.side,0.5);assert.equal(result.stats.detectionMisses,1);assert.equal(result.rearTop3Recall,1);assert.equal(result.sideGoalReached,null);assert.equal(result.automaticLinkFalseRate,null);assert.equal(result.novelPetKnownSuggestionRate,1);assert.equal(result.unresolvedRate,1);
});
test('evaluation rejects identical contents, sessions, samples and malformed vectors',()=>{
 for(const patch of [{captureGroup:'enroll'},{sourceKey:'hash1'},{sampleId:'r'},{features:feature()}])assert.throws(()=>evaluatePets({references:[reference()],queries:[query(patch)]}));
 assert.throws(()=>evaluatePets({references:[reference(),reference()],queries:[]}));
});
test('species failures are misses and user corrections are reported separately',()=>{
 const result=evaluatePets({references:[reference()],queries:[query({features:{...realDimensions(),kind:'cat'}}),query({sampleId:'corrected',features:{...realDimensions(),detectedKind:'cat'}})]});
 assert.equal(result.top1IdentificationAccuracy.side,0.5);assert.equal(result.stats.species.correct,0);assert.equal(result.stats.humanSpeciesCorrections,1);
});
test('front face candidates precede less specific body and rear-only retrieval',()=>{
 const q=feature({faceAppearance:[1,0],mirroredFaceAppearance:[1,0]});
 const face=feature({appearance:[0.6,0.8],mirroredAppearance:[0.6,0.8],faceAppearance:[1,0],mirroredFaceAppearance:[1,0]});
 assert.deepEqual(recognizePet(q,[{petId:3,features:feature({view:'rear'})},{petId:2,features:feature()},{petId:1,features:face}]).candidates.map(c=>c.petId),[1,2,3]);
});
test('original species errors do not become measured pipeline accuracy through user corrections',()=>{
 const result=evaluatePets({references:[reference()],queries:[query({features:{...realDimensions(),detectedKind:'cat'}})]});
 assert.equal(result.top1IdentificationAccuracy.side,1);assert.equal(result.modelSpeciesTop1Accuracy.side,0);
 assert.equal(evaluatePets({references:[reference()],queries:[query()]}).modelSpeciesTop1Accuracy,null);
});
test('a rear color-only reference cannot replace a usable front body reference for the same pet',()=>{
 const q=feature(),body=feature({appearance:[0.8,0.6],mirroredAppearance:[0.8,0.6]});
 assert.equal(rankPets(q,[{petId:1,features:body},{petId:1,features:feature({view:'rear'})}])[0].basis,'appearance');
});
