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
