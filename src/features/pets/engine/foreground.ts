import { normalize } from './features';
import type { PetFeatures } from './types';
// Classical border-connected foreground estimate, not learned animal anatomy.
// Preserve legacy descriptors separately; compare this version only to itself.
export function foregroundDescriptors(rgba:Uint8ClampedArray,width:number,height:number,aspect:number):PetFeatures['foreground'] {
  const count=width*height;
  if(width<8 || height<8 || count>224*224 || rgba.length!==count*4)return;
  const buckets=new Map<number,{sum:number[];count:number}>();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    if(x && y && x!==width-1 && y!==height-1)continue;
    const i=(y*width+x)*4,key=(rgba[i]>>5)*64+(rgba[i+1]>>5)*8+(rgba[i+2]>>5);
    const b=buckets.get(key)??{sum:[0,0,0],count:0};b.count++;for(let c=0;c<3;c++)b.sum[c]+=rgba[i+c];buckets.set(key,b);
  }
  const borderCount=2*width+2*height-4;
  const palette=[...buckets.values()].sort((a,b)=>b.count-a.count).slice(0,8);
  // No useful background evidence in a highly varied/tightly cropped border.
  if(palette.reduce((s,b)=>s+b.count,0)/borderCount<.55)return;
  const colors=palette.map(b=>b.sum.map(v=>v/b.count));
  const background=new Uint8Array(count),seen=new Uint8Array(count),queue=new Int32Array(count);
  let head=0,tail=0;
  const push=(p:number)=>{if(!seen[p]){seen[p]=1;queue[tail++]=p;}};
  for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}for(let y=1;y<height-1;y++){push(y*width);push(y*width+width-1);}
  const similar=(p:number)=>{const i=p*4;return colors.some(c=>c.reduce((s,v,k)=>s+(rgba[i+k]-v)**2,0)<46**2);};
  while(head<tail) {
    const p=queue[head++];background[p]=1;const x=p%width,y=Math.floor(p/width);
    for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1])if(n>=0 && !seen[n] && similar(n))push(n);
  }
  seen.set(background);let largest:number[]=[];
  for(let seed=0;seed<count;seed++) {
    if(seen[seed])continue;head=0;tail=0;push(seed);const component:number[]=[];let cx=0,cy=0;
    while(head<tail) {
      const p=queue[head++],x=p%width,y=Math.floor(p/width);component.push(p);cx+=x;cy+=y;
      for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1])if(n>=0 && !seen[n])push(n);
    }
    cx/=component.length;cy/=component.length;
    if(component.length>largest.length && cx>=width*.15 && cx<=width*.85 && cy>=height*.15 && cy<=height*.85)largest=component;
  }
  const fraction=largest.length/count;
  if(fraction<.05 || fraction>.85)return;
  let x0=width,x1=0,y0=height,y1=0;
  for(const p of largest){const x=p%width,y=Math.floor(p/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const bw=x1-x0+1,bh=y1-y0+1,color=Array<number>(120).fill(0),shape=Array<number>(10).fill(0);
  shape[0]=Math.min(4,aspect*bw/width/(bh/height))/4;shape[1]=largest.length/(bw*bh);
  for(const p of largest) {
    const x=p%width,y=Math.floor(p/width),i=p*4,cell=1+Number(x-x0>=bw/2)+2*Number(y-y0>=bh/2);
    // Two chromaticity channels reduce exposure sensitivity; a luminance
    // channel keeps black and white fur distinct. Background pixels are absent.
    const sum=rgba[i]+rgba[i+1]+rgba[i+2];
    const values=[sum?rgba[i]/sum:1/3,sum?rgba[i+1]/sum:1/3,(.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2])/256];
    for(let c=0;c<3;c++){const bin=c*8+Math.min(7,Math.floor(values[c]*8));color[bin]++;color[cell*24+bin]++;}
    shape[2+Math.min(7,Math.floor((y-y0)/bh*8))]++;
  }
  for(let i=2;i<10;i++)shape[i]/=bw*bh/8;
  return {version:'border-connected-v1',color:normalize(color),shape:normalize(shape),fraction};
}
