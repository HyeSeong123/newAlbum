import * as tf from '@tensorflow/tfjs';
import * as coco from '@tensorflow-models/coco-ssd';
import { selectPetBackend,petRuntimeInfo } from '../src/features/pets/engine/runtime';
type Sample={id:string;kind:string;url:string;box:number[]};
const iou=(a:number[],b:number[])=>{const area=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));return area/(a[2]*a[3]+b[2]*b[3]-area)||0;};
export async function compareDetectionPolicies(samples:Sample[]){
 await selectPetBackend(new URL('/models/pets/',location.href).href,'auto');
 const detector=await coco.load({base:'lite_mobilenet_v2',modelUrl:'/models/pets/detector/model.json'});
 const policies=[{name:'before-0.9.20',boxes:20,score:.55},{name:'after-0.9.21',boxes:100,score:.50}];
 const results:any[]=[];
 try{
  for(const [index,sample]of samples.entries()){
   const bitmap=await createImageBitmap(await(await fetch(sample.url)).blob());const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
   const rgb=new Int32Array(canvas.width*canvas.height*3);for(let i=0,j=0;i<pixels.length;i+=4){rgb[j++]=pixels[i];rgb[j++]=pixels[i+1];rgb[j++]=pixels[i+2];}
   const input=tf.tensor3d(rgb,[canvas.height,canvas.width,3],'int32');
   try{
    for(const policy of index%2?[...policies].reverse():policies){
     const start=performance.now();const all=await detector.detect(input,policy.boxes,policy.score);const elapsedMs=performance.now()-start;
     const pets=all.filter(row=>row.class==='dog'||row.class==='cat').slice(0,20);
     const correct=pets.filter(row=>row.class===sample.kind).map(row=>iou([row.bbox[0]/canvas.width,row.bbox[1]/canvas.height,row.bbox[2]/canvas.width,row.bbox[3]/canvas.height],sample.box));
     results.push({id:sample.id,kind:sample.kind,policy:policy.name,hit:Math.max(0,...correct)>=.5,bestIoU:Math.max(0,...correct),detectedPets:pets.length,elapsedMs,observedTensorBytes:tf.memory().numBytes});
    }
   }finally{input.dispose();}
  }
 }finally{detector.dispose();}
 return {environment:'GitHub-hosted Linux Chromium WASM/CPU; not Android phone',runtime:petRuntimeInfo(),results,identityAccuracyMeasured:false,poseAccuracyMeasured:false,falseLinkRateMeasured:false,wholeAppMemoryMeasured:false,notes:'IoU >=0.5 against the annotated target body from the trimap. Oxford annotates the target pet; unmatched predictions cannot be treated as fully audited false positives. No threshold calibration or automatic linking.'};
}
