import * as tf from '@tensorflow/tfjs';
import type { Point } from './pose';
import {alignmentTransform,validEmbedding} from './faceAlignment';
export interface EmbeddingModelSpec {
  version:string; dimensions:512; inputSize:112; assetDirectory:string;
  inputName?:string; outputName?:string; offset:number; scale:number;
}
// Deliberately empty: no 512-D weights with verified code, weights AND training
// data commercial rights have been obtained. A registry entry is a reviewed
// release decision, not a user supplied permission flag.
export const APPROVED_512_MODELS:ReadonlyArray<EmbeddingModelSpec>=[];
export class GraphFace512Adapter {
  private model:tf.GraphModel|null=null;private spec:EmbeddingModelSpec|null=null;
  async load(version:string,base:string) {
    const spec=APPROVED_512_MODELS.find(m=>m.version===version);if(!spec)throw new Error('상업적 이용 조건이 확인된 512차원 모델이 설치되지 않았습니다.');
    this.dispose();const root=new URL(spec.assetDirectory,base.endsWith('/')?base:`${base}/`);
    const offlineFetch:typeof fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,root);if(!url.href.startsWith(root.href)||url.origin!==new URL(base).origin)throw new Error('External model asset rejected');return fetch(url,init);};
    try {this.model=await tf.loadGraphModel(tf.io.browserHTTPRequest(new URL('model.json',root).href,{fetchFunc:offlineFetch}));this.spec=spec;}catch(error){this.dispose();throw error;}
  }
  async extract(image:OffscreenCanvas,landmarks:Point[]):Promise<number[]> {
    if(!this.model||!this.spec)throw new Error('512차원 모델 미설치');
    const spec=this.spec,aligned=new OffscreenCanvas(spec.inputSize,spec.inputSize),ctx=aligned.getContext('2d')!;
    const [a,b,c,d,e,f]=alignmentTransform(landmarks);ctx.setTransform(a,b,c,d,e,f);ctx.drawImage(image,0,0);
    const input=tf.tidy(()=>tf.browser.fromPixels(aligned as unknown as HTMLCanvasElement).toFloat().sub(spec.offset).mul(spec.scale).expandDims(0));
    let outputs:tf.Tensor|tf.Tensor[]|tf.NamedTensorMap|undefined;
    try {
      outputs=await this.model.executeAsync(spec.inputName?{[spec.inputName]:input}:input,spec.outputName);
      const values=Array.isArray(outputs)?outputs:Object.values(outputs instanceof tf.Tensor?{output:outputs}:outputs);
      if(values.length!==1||values[0].size!==512)throw new Error('Model must output one learned 512-D embedding');
      const vector=Array.from(await values[0].data());if(!validEmbedding(vector,512))throw new Error('Invalid learned embedding');
      const norm=Math.hypot(...vector);return vector.map(v=>v/norm);
    }finally {input.dispose();if(outputs)tf.dispose(outputs);}
  }
  dispose(){this.model?.dispose();this.model=null;this.spec=null;}
}
