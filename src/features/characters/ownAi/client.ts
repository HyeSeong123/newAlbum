import type {OwnInput} from "./engine";

type Result = {line:string;totalMs:number;generationMs:number};
type Pending = {resolve:(value:Result)=>void;reject:(error:Error)=>void;started:number;dispose:()=>void};
let worker: Worker | undefined, ready: Promise<void> | undefined, count = 0;
const pending = new Map<number,Pending>();
const metrics = {loadMs:0,totalMs:0,generationMs:0,bytes:0,loadCount:0,stage:"idle",lastAt:0,lastError:"",lastOutcome:"none"};
export function warmOwnAi(): Promise<void> {
  if (ready) return ready;
  if (typeof Worker === "undefined") return Promise.reject(new Error("AI_OWN_WORKER_UNAVAILABLE"));
  ready = new Promise<void>((resolve,reject) => {
    worker = new Worker(new URL("./worker.ts",import.meta.url),{type:"module"});
    const fail = (error: Error) => {
      metrics.lastError=error.message;metrics.stage="error";metrics.lastOutcome="error";
      reject(error);
      for (const job of pending.values()) { job.dispose();job.reject(error); }
      pending.clear();worker?.terminate();worker=undefined;ready=undefined;
    };
    worker.onerror=() => fail(new Error("AI_OWN_WORKER_FAILED"));
    worker.onmessage=event => {
      const data=event.data;
      if (data.type === "ready") {
        metrics.loadMs=data.loadMs;metrics.bytes=data.bytes;metrics.loadCount++;metrics.stage="ready";resolve();return;
      }
      if (data.type === "load-error") {fail(new Error(data.error));return;}
      const job=pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);job.dispose();metrics.lastAt=Date.now();
      if (data.type === "error") {metrics.lastError=data.error;metrics.lastOutcome="error";metrics.stage="ready";job.reject(new Error(data.error));return;}
      metrics.totalMs=performance.now()-job.started;metrics.generationMs=data.generationMs;metrics.lastError="";metrics.lastOutcome="success";metrics.stage="complete";
      job.resolve({line:data.line,totalMs:metrics.totalMs,generationMs:data.generationMs});
    };
  });
  return ready;
}
export async function generateOwnReaction(input: OwnInput, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new Error("AI_CANCELLED");
  const started=performance.now();
  // The deadline includes a cold Worker/model load; a timeout is an error, never
  // a cached or authored line presented as generated speech.
  return new Promise<string>((resolve,reject) => {
    const id=++count;
    const cancel=() => finish(new Error("AI_CANCELLED"));
    const timer=setTimeout(() => finish(new Error("AI_OWN_TIMEOUT")),900);
    const dispose=() => {clearTimeout(timer);signal?.removeEventListener("abort",cancel);};
    const finish=(error:Error) => {const job=pending.get(id);if(!job)return;pending.delete(id);dispose();metrics.lastError=error.message;metrics.lastOutcome=error.message==="AI_CANCELLED"?"cancelled":"error";reject(error);};
    pending.set(id,{started,dispose,resolve:value=>resolve(value.line),reject});
    signal?.addEventListener("abort",cancel,{once:true});
    metrics.stage="generating";metrics.lastOutcome="running";
    void warmOwnAi().then(() => {
      if (!pending.has(id)) return;
      if (signal?.aborted) {cancel();return;}
      worker!.postMessage({id,input,seed:crypto.getRandomValues(new Uint32Array(1))[0]});
    }).catch(error => finish(error instanceof Error?error:new Error(String(error))));
  });
}
export function stopOwnAi() {
  if(pending.size){metrics.lastOutcome="cancelled";metrics.stage="ready";}
  for (const job of pending.values()) {job.dispose();job.reject(new Error("AI_CANCELLED"));}
  pending.clear();
}
export function ownAiStatus() {
  return {phase:metrics.stage==="error"?"error":"ready",supported:typeof Worker!=="undefined",installed:metrics.stage!=="error",downloaded:0,
    total:metrics.bytes,message:"곰고미 전용 AI가 앱에 포함되어 있어요. 인터넷 없이 새 한마디를 만들어요.",model:"own-character-v3",bundled:true,upgradeAvailable:false,
    lastOutcome:metrics.lastOutcome,lastError:metrics.lastError,lastAt:metrics.lastAt,
    runtime:{resident:Boolean(worker),loadCount:metrics.loadCount,stage:metrics.stage,loadMs:metrics.loadMs,totalMs:metrics.totalMs,
      generationMs:metrics.generationMs,ownModelApplied:metrics.lastOutcome==="success"}};
}
