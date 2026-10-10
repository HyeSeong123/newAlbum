export interface CatCascade {
  width: number; height: number;
  features: number[][][];
  stages: { threshold: number; weak: number[][] }[];
}
export type FaceBox = [number, number, number, number];
interface Hit { x: number; y: number; size: number; count: number }
function iou(a: Hit, b: Hit) {
  const area = Math.max(0, Math.min(a.x+a.size,b.x+b.size)-Math.max(a.x,b.x))
    * Math.max(0, Math.min(a.y+a.size,b.y+b.size)-Math.max(a.y,b.y));
  return area / (a.size*a.size+b.size*b.size-area);
}
// Evaluate the BSD-licensed OpenCV 4.12.0 frontal-cat Haar cascade in the
// existing Worker. No OpenCV runtime, neural landmarks or identity classifier.
function scan(gray: Uint8Array, width: number, height: number, cascade: CatCascade): Hit[] {
  const hits: Hit[]=[];
  // Resize the image pyramid, keeping the trained feature rectangles fixed.
  // Scaling individual rectangles would distort their geometry and weights.
  for(let scale=1;Math.round(Math.min(width,height)/scale)>=cascade.width;scale*=1.15) {
    const w=Math.round(width/scale),h=Math.round(height/scale),stride=w+1;
    const resized=new Uint8Array(w*h),integral=new Float64Array(stride*(h+1)),squared=new Float64Array(integral.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const sx=Math.max(0,(x+.5)*width/w-.5),sy=Math.max(0,(y+.5)*height/h-.5),x0=Math.min(width-1,Math.floor(sx)),y0=Math.min(height-1,Math.floor(sy));
      const x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=sx-x0,dy=sy-y0;
      resized[y*w+x]=Math.round((gray[y0*width+x0]*(1-dx)+gray[y0*width+x1]*dx)*(1-dy)+(gray[y1*width+x0]*(1-dx)+gray[y1*width+x1]*dx)*dy);
    }
    for(let y=0;y<h;y++) {
      let sum=0,sq=0;
      for(let x=0;x<w;x++){const p=resized[y*w+x],i=(y+1)*stride+x+1;sum+=p;sq+=p*p;integral[i]=integral[i-stride]+sum;squared[i]=squared[i-stride]+sq;}
    }
    const rectangle=(data:Float64Array,x:number,y:number,rw:number,rh:number)=>data[(y+rh)*stride+x+rw]-data[y*stride+x+rw]-data[(y+rh)*stride+x]+data[y*stride+x];
    const area=(cascade.width-2)*(cascade.height-2),step=scale<2?2:1;
    for(let y=0;y+cascade.height<=h;y+=step)for(let x=0;x+cascade.width<=w;x+=step) {
      const sum=rectangle(integral,x+1,y+1,cascade.width-2,cascade.height-2),sq=rectangle(squared,x+1,y+1,cascade.width-2,cascade.height-2);
      const variance=Math.max(0,sq*area-sum*sum);if(variance<=area*area*100)continue;
      const norm=Math.sqrt(variance);let accepted=true;
      for(const stage of cascade.stages) {
        let stageSum=0;
        for(const [feature,threshold,left,right] of stage.weak) {
          let value=0;
          for(const [rx,ry,rw,rh,weight] of cascade.features[feature])value+=weight*rectangle(integral,x+rx,y+ry,rw,rh);
          stageSum+=value<threshold*norm?left:right;
        }
        if(stageSum<stage.threshold){accepted=false;break;}
      }
      if(accepted)hits.push({x:x*width/w,y:y*height/h,size:cascade.width*(width/w+height/h)/2,count:1});
    }
  }
  // Multiple scales/windows must agree. Counts are votes, never probabilities.
  const groups: Hit[][]=[];
  for(const hit of hits){const group=groups.find(g=>g.some(other=>iou(hit,other)>.55));if(group)group.push(hit);else groups.push([hit]);}
  return groups.filter(g=>g.length>=3).map(g=>({x:g.reduce((s,h)=>s+h.x,0)/g.length,y:g.reduce((s,h)=>s+h.y,0)/g.length,size:g.reduce((s,h)=>s+h.size,0)/g.length,count:g.length})).sort((a,b)=>b.count-a.count);
}
export function detectCatFrontFace(rgba: Uint8ClampedArray,width:number,height:number,cascade:CatCascade): FaceBox | undefined {
  if(width<24 || height<24 || width>224 || height>224 || rgba.length!==width*height*4)return;
  const gray=new Uint8Array(width*height),mirror=new Uint8Array(gray.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*4,p=Math.round(.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2]);gray[y*width+x]=p;mirror[y*width+width-1-x]=p;
  }
  const direct=scan(gray,width,height,cascade),reflected=scan(mirror,width,height,cascade).map(h=>({...h,x:width-h.x-h.size}));
  if(direct.length!==1 || reflected.length!==1 || iou(direct[0],reflected[0])<.55)return;
  const a=direct[0],b=reflected[0],x=Math.max(0,(a.x+b.x)/2),y=Math.max(0,(a.y+b.y)/2),size=(a.size+b.size)/2;
  return [x/width,y/height,Math.min(size,width-x)/width,Math.min(size,height-y)/height];
}
