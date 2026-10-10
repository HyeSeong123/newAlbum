import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const { decodePetHeatmaps, petHeadDirection } = await import(await modelUrl('features/pets/engine/poseGeometry.ts'));
const points = (head) => [...head.map(([x,y])=>({x,y,score:.8})),...Array.from({length:13},()=>({x:.5,y:.5,score:.8}))];
test('muzzle direction reflects displayed pixels and does not depend on anatomical eye names',()=>{
 const right=points([[.43,.3],[.44,.31],[.55,.33],[.3,.5]]);
 assert.equal(petHeadDirection(right),'right');
 assert.equal(petHeadDirection(right.map(p=>({...p,x:1-p.x}))),'left');
 const swapped=structuredClone(right);[swapped[0],swapped[1]]=[swapped[1],swapped[0]];assert.equal(petHeadDirection(swapped),'right');
 assert.equal(petHeadDirection(points([[.4,.3],[.6,.3],[.5,.4],[.5,.6]])),'front');
});
test('missing face points, weak evidence and contradictory head geometry abstain',()=>{
 const p=points([[.43,.3],[.44,.31],[.55,.33],[.3,.5]]);
 for(const index of [2,3]){const q=structuredClone(p);q[index].score=.1;assert.equal(petHeadDirection(q),'unknown');}
 const noEyes=structuredClone(p);noEyes[0].score=noEyes[1].score=0;assert.equal(petHeadDirection(noEyes),'unknown');
 const opposite=structuredClone(p);opposite[3].x=.7;assert.equal(petHeadDirection(opposite),'unknown');
 assert.equal(petHeadDirection(points([[.5,.3],[.5,.3],[.5,.3],[.5,.3]])),'unknown');
 const bad=structuredClone(p);bad[2].x=NaN;assert.equal(petHeadDirection(bad),'unknown');
});
test('ONNX channel-major heatmaps preserve point order and confidence',()=>{
 const data=new Float32Array(17*4096);
 for(let k=0;k<17;k++)data[k*4096+20*64+10+k]=.6;
 const decoded=decodePetHeatmaps(data,[1,17,64,64]);
 decoded.forEach((p,k)=>{assert.equal(p.x,(10+k)/64);assert.equal(p.y,20/64);assert.ok(Math.abs(p.score-.6)<1e-6);});
 assert.throws(()=>decodePetHeatmaps(data,[1,64,64,17]));
 data[0]=NaN;assert.throws(()=>decodePetHeatmaps(data,[1,17,64,64]));
});
