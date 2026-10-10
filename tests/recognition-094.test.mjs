import test from 'node:test';
import assert from 'node:assert/strict';
import {modelUrl} from './model-loader.mjs';
const {projectHead,estimateFacePose}=await import(await modelUrl('features/people/engine/pose.ts'));
const {rate,pairKey,sampleTimes,VIEW_PAIRS}=await import(await modelUrl('features/ai/metrics.ts'));
const {audit800Protocol}=await import(await modelUrl('features/ai/protocol.ts'));
test('perspective pose separates yaw, pitch and roll and reflects screen directions',()=>{
 for(const [pitch,yaw,roll,expected] of [[0,0,0,'front'],[10,45,15,'left'],[-10,-45,-15,'right'],[0,0,40,'front'],[0,23,0,'unknown']]){
  const points=projectHead([pitch,yaw,roll].map(v=>v*Math.PI/180).concat([12,-5,600]),1000,{x:500,y:500});
  const actual=estimateFacePose(points,1000,1000);assert.equal(actual.view,expected);
  assert.ok(Math.abs(actual.yawDegrees-yaw)<.02);assert.ok(Math.abs(actual.pitchDegrees-pitch)<.02);assert.ok(Math.abs(actual.rollDegrees-roll)<.02);
 }
 const points=projectHead([0,.7,0,0,0,600],1000,{x:500,y:500});
 const mirrored=points.map(p=>({x:1000-p.x,y:p.y}));[mirrored[2],mirrored[3]]=[mirrored[3],mirrored[2]];[mirrored[4],mirrored[5]]=[mirrored[5],mirrored[4]];
 assert.equal(estimateFacePose(points,1000,1000).view,'left');assert.equal(estimateFacePose(mirrored,1000,1000).view,'right');
 assert.equal(estimateFacePose(Array(6).fill({x:0,y:0}),1000,1000).view,'unknown');
});
test('Wilson intervals and six pairs keep empty and left/right trials distinct',()=>{
 assert.equal(rate(0,0).rate,null);assert.equal(rate(60,100).wilson95[0]<.6,true);assert.equal(rate(80,100).wilson95[0]>.6,true);
 assert.equal(VIEW_PAIRS.length,6);assert.equal(pairKey('right','left'),'left-right');assert.throws(()=>rate(2,1));
 assert.deepEqual(sampleTimes([3,1,8,2]),{samples:4,meanMs:3.5,medianMs:2.5});
});
const build=()=>{const samples=[];let n=0;for(const species of ['person','dog','cat'])for(let id=0;id<(species==='person'?10:5);id++)for(const role of ['reference','query'])for(const view of ['front','left','right'])for(let i=0;i<(role==='reference'?2:view==='front'?10:12);i++){n++;samples.push({sampleId:String(n),entityId:String(id),species,role,view,captureGroup:role,originId:String(n),sourceKey:'sha256:'+n.toString(16).padStart(64,'0'),rights:'synthetic metadata for protocol unit test only',suite:'basic'});}return samples;};
test('800 protocol rejects derivative counts, cross-session leakage and missing right profiles',()=>{
 const complete=build();assert.equal(complete.length,800);assert.equal(audit800Protocol(complete).complete,true);
 assert.equal(audit800Protocol([]).complete,false);
 for(const mutate of [s=>s[10].derivativeOf=s[0].sampleId,s=>s[10].originId=s[0].originId,s=>s[10].sourceKey=s[0].sourceKey,s=>s[10].captureGroup='reference',s=>s.pop()]){const samples=structuredClone(complete);mutate(samples);assert.equal(audit800Protocol(samples).complete,false);}
});

const {alignmentTransform,validEmbedding}=await import(await modelUrl('features/people/engine/faceAlignment.ts'));
test('five-point alignment fits rotation and scale; dimensions alone do not approve learned output',()=>{
 const target=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
 const points=target.map(([x,y])=>({x:2*x-y+10,y:x+2*y-20}));
 const [a,b,c,d,e,f]=alignmentTransform(points);
 points.forEach((p,i)=>{assert.ok(Math.abs(a*p.x+c*p.y+e-target[i][0])<1e-6);assert.ok(Math.abs(b*p.x+d*p.y+f-target[i][1])<1e-6);});
 assert.throws(()=>alignmentTransform(Array(5).fill({x:0,y:0})));
 assert.equal(validEmbedding(Array(512).fill(0),512),false);assert.equal(validEmbedding(Array(128).fill(1),512),false);assert.equal(validEmbedding([NaN,...Array(511).fill(0)],512),false);
 // Shape validity cannot prove that a vector is learned; native registry approval
 // is additionally required and rejects every unapproved model in this release.
});
