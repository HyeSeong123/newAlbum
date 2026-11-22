// First-party word neural inference. Learned scene/intent support is a word
// transition constraint, never a list of complete replies to select from.
export type OwnInput = {
  characterId:string;action:string;affection:number;mood?:string;energy?:number;
  sleeping?:boolean;condition?:"normal"|"cold"|"unwell";previous?:string[];
};
type Matrix={rows:number;cols:number;values:Float32Array};
type Packed={shape:number[];values:string;scales:string};
export type OwnModel={
  vocab:string[];tokenIds:Map<string,number>;features:Map<string,number>;characters:string[];actions:string[];
  weights:Record<string,Matrix>;grammars:Array<Map<number,Set<number>>>;scenes:Map<string,number[]>;
};
const invalid=()=>new Error("AI_OWN_MODEL_INVALID");
function unpack(item:Packed|undefined,shape:number[]):Matrix{
  if(!item||JSON.stringify(item.shape)!==JSON.stringify(shape)||typeof item.values!=="string"||typeof item.scales!=="string")throw invalid();
  const raw=Uint8Array.from(atob(item.values),x=>x.charCodeAt(0)),scales=Uint8Array.from(atob(item.scales),x=>x.charCodeAt(0));
  const rows=shape[0],cols=shape.length>1?shape[1]:1;
  if(raw.length!==rows*cols||scales.length!==rows*4)throw invalid();
  const view=new DataView(scales.buffer),signed=new Int8Array(raw.buffer),values=new Float32Array(raw.length);
  for(let r=0;r<rows;r++){
    const scale=view.getFloat32(r*4,true);if(!Number.isFinite(scale)||scale<=0||scale>100)throw invalid();
    for(let c=0;c<cols;c++)values[r*cols+c]=signed[r*cols+c]*scale;
  }
  return {rows,cols,values};
}
export function loadOwnModel(raw:unknown):OwnModel{
  const m=raw as {format?:string;context?:number;embedding?:number;hidden?:number;supportOrder?:number;
    vocab?:string[];features?:string[];characters?:string[];actions?:string[];grammars?:Array<Array<[number,number,number[]]>>;
    scenes?:Record<string,number[]>;weights?:Record<string,Packed>;
    provenance?:{initialization?:string;pretrainedParents?:string[];teacherModel?:string|null}};
  if(!m||m.format!=="gomgomi-own-wordnet-v3"||m.context!==4||m.embedding!==24||m.hidden!==112||m.supportOrder!==2||
    !Array.isArray(m.vocab)||m.vocab.length<10||m.vocab.length>5000||m.vocab.slice(0,4).join()!=="<bos>,<eos>,<pad>,<unk>"||
    new Set(m.vocab).size!==m.vocab.length||!Array.isArray(m.features)||new Set(m.features).size!==m.features.length||
    !Array.isArray(m.characters)||!Array.isArray(m.actions)||!Array.isArray(m.grammars)||!m.grammars.length||m.grammars.length>10000||
    !m.scenes||typeof m.scenes!=="object"||m.provenance?.initialization!=="random"||
    m.provenance.pretrainedParents?.length!==0||m.provenance.teacherModel!==null)throw invalid();
  const v=m.vocab.length,f=m.features.length,weights:Record<string,Matrix>={};
  const shapes:Record<string,number[]>={"tokens.weight":[v,24],"features.weight":[f,24],"feature_bias.weight":[f,v],
    "hidden.weight":[112,120],"hidden.bias":[112],"output.weight":[v,112],"output.bias":[v]};
  for(const [key,shape] of Object.entries(shapes))weights[key]=unpack(m.weights?.[key],shape);
  const grammars=m.grammars.map(table=>{
    if(!Array.isArray(table)||!table.length)throw invalid();
    const result=new Map<number,Set<number>>();
    for(const row of table){
      if(!Array.isArray(row)||row.length!==3)throw invalid();
      const [a,b,next]=row;
      if(!Number.isInteger(a)||a<0||a>=v||!Number.isInteger(b)||b<0||b>=v||!Array.isArray(next)||!next.length||
        next.some(id=>!Number.isInteger(id)||id<1||id>=v||id===2||id===3)||result.has(a*v+b))throw invalid();
      result.set(a*v+b,new Set(next));
    }
    return result;
  });
  const scenes=new Map<string,number[]>();
  for(const [key,ids] of Object.entries(m.scenes)){
    if(key.split("|").length!==6||!Array.isArray(ids)||!ids.length||ids.some(id=>!Number.isInteger(id)||id<0||id>=grammars.length))throw invalid();
    scenes.set(key,ids);
  }
  if(!scenes.size||scenes.size>10000)throw invalid();
  return {vocab:m.vocab,tokenIds:new Map(m.vocab.map((word,id)=>[word,id])),features:new Map(m.features.map((name,id)=>[name,id])),
    characters:m.characters,actions:m.actions,weights,grammars,scenes};
}
function tier(input:OwnInput):string{
  const a=input.affection;
  if(input.characterId==="gomi")return a>=90?"bonded":a>=60?"close":a>=30?"familiar":a>=20?"reserved":"distant";
  return a>=60?"close":a>=30?"familiar":"distant";
}
function energy(input:OwnInput):string{
  const value=input.energy??3;
  return value<=0?"exhausted":input.sleeping||value<=1?"low":"normal";
}
export function ownSceneKey(input:OwnInput):string{
  return [input.characterId,input.action,tier(input),input.sleeping?"asleep":"awake",input.condition||"normal",energy(input)].join("|");
}
export function ownFeatureNames(input:OwnInput):string[]{
  const state=input.sleeping?"asleep":"awake",condition=input.condition||"normal",fatigue=energy(input);
  return ["character:"+input.characterId,"action:"+input.action,"tier:"+tier(input),"state:"+state,"condition:"+condition,
    "mood:"+(input.mood||"calm"),"energy:"+fatigue,"scenario:"+input.action+"/"+state+"/"+condition+"/"+fatigue];
}
function conditioned(model:OwnModel,input:OwnInput){
  if(!model.characters.includes(input.characterId))throw new Error("AI_CHARACTER_UNTRAINED");
  if(!model.actions.includes(input.action))throw new Error("AI_ACTION_UNTRAINED");
  if(!Number.isFinite(input.affection)||input.affection<0||input.affection>100||
    !Number.isInteger(input.energy??3)||(input.energy??3)<0||(input.energy??3)>5)throw new Error("AI_STATE_INVALID");
  const ids=ownFeatureNames(input).map(name=>{const id=model.features.get(name);if(id==null)throw new Error("AI_STATE_UNTRAINED:"+name);return id;});
  const emb=new Float32Array(24),bias=new Float32Array(model.vocab.length);
  for(const id of ids){
    const e=model.weights["features.weight"].values,b=model.weights["feature_bias.weight"].values;
    for(let j=0;j<24;j++)emb[j]+=e[id*24+j]/ids.length;
    for(let j=0;j<bias.length;j++)bias[j]+=b[id*bias.length+j]/ids.length;
  }
  const hiddenBase=new Float32Array(112),hw=model.weights["hidden.weight"].values,hb=model.weights["hidden.bias"].values;
  for(let h=0;h<112;h++){let value=hb[h];for(let j=0;j<24;j++)value+=emb[j]*hw[h*120+96+j];hiddenBase[h]=value;}
  return {bias,hiddenBase};
}
function scores(model:OwnModel,history:number[],state:ReturnType<typeof conditioned>,allowed:Set<number>){
  const hidden=new Float32Array(112),embed=model.weights["tokens.weight"].values,hw=model.weights["hidden.weight"].values;
  const ow=model.weights["output.weight"].values,ob=model.weights["output.bias"].values;
  for(let h=0;h<112;h++){
    let value=state.hiddenBase[h];
    for(let p=0;p<4;p++)for(let j=0;j<24;j++)value+=embed[history[p]*24+j]*hw[h*120+p*24+j];
    hidden[h]=Math.tanh(value);
  }
  return [...allowed].map(id=>{
    let score=ob[id]+state.bias[id];for(let h=0;h<112;h++)score+=hidden[h]*ow[id*112+h];return {id,score};
  }).sort((a,b)=>b.score-a.score);
}
const tokens=(line:string)=>line.match(/[^\s.!?…]+|[.!?…]/gu)||[];
const normalized=(line:string)=>line.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu,"");
const render=(words:string[])=>words.join(" ").replace(/\s+([.!?…])/g,"$1").trim();
export function supportsOwnLine(model:OwnModel,input:OwnInput,line:string):boolean{
  let groups=model.scenes.get(ownSceneKey(input))||[],a=0,b=0;
  for(const token of [...tokens(line),"<eos>"]){
    const next=model.tokenIds.get(token);if(next==null)return false;
    groups=groups.filter(id=>model.grammars[id].get(a*model.vocab.length+b)?.has(next));
    if(!groups.length)return false;a=b;b=next;
  }
  return true;
}
function acceptable(line:string, excluded:Set<string>):boolean{
  if(!/[가-힣]/.test(line)||Array.from(line).length<4||Array.from(line).length>50||/[<>{}]|고미는|건드지/.test(line))return false;
  if(excluded.has(normalized(line)))return false;
  const sentences=line.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[];
  if(sentences.length>2)return false;
  if(sentences.length===2){
    const a=normalized(sentences[0]!),b=normalized(sentences[1]!);
    if(a===b||a.endsWith(b)||b.endsWith(a))return false;
  }
  return true;
}
export function generateOwnLine(model:OwnModel,input:OwnInput,seed=Date.now(),cancelled=()=>false):string{
  if(cancelled())throw new Error("AI_CANCELLED");
  const state=conditioned(model,input),initialGroups=model.scenes.get(ownSceneKey(input));
  if(!initialGroups)throw new Error("AI_SCENE_UNTRAINED");
  const started=performance.now();
  let randomState=(seed|0)||1,evaluated=0;
  let excluded = new Set<string>();
  const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return(randomState>>>0)/4294967296;};
  function decode(history:number[],words:string[],groups:number[],step:number):string|undefined{
    if(cancelled())throw new Error("AI_CANCELLED");
    if(performance.now()-started>700)throw new Error("AI_OWN_TIMEOUT");
    if(step>=24||evaluated>=256)return undefined;evaluated++;
    const edge=history[2]*model.vocab.length+history[3],allowed=new Set<number>();
    for(const id of groups)for(const next of model.grammars[id].get(edge)||[])allowed.add(next);
    const count=words.filter(word=>/^[.!?]$/.test(word)).length;
    const candidates=scores(model,history,state,allowed).filter(({id})=>
      id===1?words.length>=2:count<2&&!/[<>{}]|고미는|건드지/.test(model.vocab[id]));
    // Keep every supported candidate: a top-k cutoff could hide all fresh
    // continuations after the recent-reply filter rejects common completions.
    while(candidates.length&&evaluated<256){
      const weights=candidates.map(item=>Math.exp((item.score-candidates[0].score)/0.7));
      let draw=random()*weights.reduce((sum,value)=>sum+value,0),selected=candidates.length-1;
      for(let i=0;i<candidates.length;i++){draw-=weights[i];if(draw<=0){selected=i;break;}}
      const chosen=candidates.splice(selected,1)[0].id;
      if(chosen===1){const line=render(words);if(acceptable(line,excluded)&&supportsOwnLine(model,input,line))return line;continue;}
      const next=[...words,model.vocab[chosen]];if(Array.from(render(next)).length>50)continue;
      const remaining=groups.filter(id=>model.grammars[id].get(edge)?.has(chosen));
      const line=decode([...history.slice(1),chosen],next,remaining,step+1);if(line)return line;
    }
    return undefined;
  }
  const previous = input.previous ?? [];
  const windows = input.characterId === "gomi" || input.characterId === "apple" ? [24,12,3] : [12,3];
  let lastWindow = -1;
  for (const size of windows) {
    const window = Math.min(size, previous.length);
    if (lastWindow === window) continue;
    lastWindow = window;
    excluded = new Set(previous.slice(-size).map(normalized));
    evaluated = 0;
    const line = decode([0,0,0,0],[],initialGroups,0);
    if (line) return line;
  }
  throw new Error("AI_OWN_NO_VALID_LINE");
}
