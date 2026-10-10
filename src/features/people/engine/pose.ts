export type FaceView = 'front' | 'left' | 'right' | 'unknown';
export interface Point { x: number; y: number }
export interface FacePose {
  version: 'landmarks-pnp-v1'; view: FaceView; yawDegrees: number | null;
  pitchDegrees: number | null; rollDegrees: number | null;
  quality: 'estimated' | 'unknown'; normalizedError: number | null;
}
// Camera coordinates: x right, y down, z into the image. Positive yaw faces
// screen-left. This approximate canonical head is geometry, not a trained model.
export const HEAD_POINTS = [[0,0,-40],[0,65,0],[-35,-25,0],[35,-25,0],[-25,30,-5],[25,30,-5]];
export function projectHead(parameters: number[], focal: number, center: Point): Point[] {
  const [pitch,yaw,roll,tx,ty,tz]=parameters, sx=Math.sin(pitch),cx=Math.cos(pitch),sy=Math.sin(yaw),cy=Math.cos(yaw),sz=Math.sin(roll),cz=Math.cos(roll);
  return HEAD_POINTS.map(([x,y,z])=>{
    const y1=cx*y-sx*z,z1=sx*y+cx*z,x2=cy*x+sy*z1,z2=-sy*x+cy*z1;
    return {x:center.x+focal*(cz*x2-sz*y1+tx)/(z2+tz),y:center.y+focal*(sz*x2+cz*y1+ty)/(z2+tz)};
  });
}
function solve(a:number[][],b:number[]):number[]|null {
  const m=a.map((row,i)=>[...row,b[i]]),n=b.length;
  for(let k=0;k<n;k++) {
    let p=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[p][k]))p=i;
    if(Math.abs(m[p][k])<1e-12)return null;[m[k],m[p]]=[m[p],m[k]];
    const v=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=v;
    for(let i=0;i<n;i++)if(i!==k){const v=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=v*m[k][j];}
  }return m.map(row=>row[n]);
}
export function estimateFacePose(points:Point[],width:number,height:number):FacePose {
  const unknown:FacePose={version:'landmarks-pnp-v1',view:'unknown',yawDegrees:null,pitchDegrees:null,rollDegrees:null,quality:'unknown',normalizedError:null};
  if(points.length!==6 || width<=0 || height<=0 || !points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return unknown;
  const span=Math.hypot(points[3].x-points[2].x,points[3].y-points[2].y),scale=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
  if(span<12 || scale<12)return unknown;
  const focal=Math.max(width,height),center={x:width/2,y:height/2},depth=focal*70/span;
  const residual=(p:number[])=>projectHead(p,focal,center).flatMap((q,i)=>[q.x-points[i].x,q.y-points[i].y]);
  const loss=(r:number[])=>r.reduce((s,v)=>s+v*v,0);
  let best:number[]|null=null,bestLoss=Infinity;
  for(const yaw of [-.7,0,.7]) {
    let p=[0,yaw,Math.atan2(points[3].y-points[2].y,points[3].x-points[2].x),(points[0].x-center.x)*depth/focal,(points[0].y-center.y)*depth/focal,depth],lambda=.01;
    for(let iter=0;iter<55;iter++) {
      const r=residual(p),j=p.map((_,k)=>{const q=[...p],step=k<3?1e-5:1e-3;q[k]+=step;return residual(q).map((v,i)=>(v-r[i])/step);});
      const a=j.map((col,k)=>j.map((other,l)=>col.reduce((s,v,i)=>s+v*other[i],0)+(k===l?lambda:0)));
      const d=solve(a,j.map(col=>-col.reduce((s,v,i)=>s+v*r[i],0)));if(!d)break;
      const q=p.map((v,k)=>v+d[k]);
      if(q[5]>80 && loss(residual(q))<loss(r)){p=q;lambda=Math.max(lambda/3,1e-7);if(Math.hypot(...d)<1e-5)break;}else lambda*=8;
    }
    const l=loss(residual(p));if(l<bestLoss){best=p;bestLoss=l;}
  }
  if(!best)return unknown;
  const degrees=best.slice(0,3).map(r=>Math.atan2(Math.sin(r),Math.cos(r))*180/Math.PI),[pitch,yaw,roll]=degrees;
  const error=Math.sqrt(bestLoss/12)/scale;
  if(error>.08 || Math.abs(pitch)>50 || Math.abs(yaw)>80 || Math.abs(roll)>70)return {...unknown,normalizedError:error};
  // Boundary bands abstain. Roll never supplies a horizontal direction label.
  const view:FaceView=Math.abs(yaw)<18?'front':yaw>28?'left':yaw< -28?'right':'unknown';
  return {version:'landmarks-pnp-v1',view,yawDegrees:yaw,pitchDegrees:pitch,rollDegrees:roll,quality:'estimated',normalizedError:error};
}
