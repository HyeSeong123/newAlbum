import type {Point} from './pose';
export function validEmbedding(vector:readonly number[],dimensions:number) {
  return vector.length===dimensions && vector.every(Number.isFinite) && vector.some(v=>Math.abs(v)>1e-12);
}
export function alignmentTransform(points:Point[]):number[] {
  const target=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
  if(points.length!==5||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('Five facial landmarks required');
  const mx=points.reduce((s,p)=>s+p.x,0)/5,my=points.reduce((s,p)=>s+p.y,0)/5,tx=target.reduce((s,p)=>s+p[0],0)/5,ty=target.reduce((s,p)=>s+p[1],0)/5;
  let denom=0,a=0,b=0;points.forEach((p,i)=>{const x=p.x-mx,y=p.y-my,u=target[i][0]-tx,v=target[i][1]-ty;denom+=x*x+y*y;a+=x*u+y*v;b+=x*v-y*u;});
  if(denom<1)throw new Error('Degenerate face alignment');a/=denom;b/=denom;
  return [a,b,-b,a,tx-a*mx+b*my,ty-b*mx-a*my];
}
