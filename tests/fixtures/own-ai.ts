import type {Page} from '@playwright/test';

type Options = {
  characterId?: 'gomi' | 'potato'; affection?: number; sleeping?: boolean;
  interactionDelay?: number; saveError?: boolean;
  worker?: {delay?: number; error?: string; controlled?: boolean};
};

// The real Home, relationship persistence, queue and client stay in use.
// Only inference is replaced for tests requiring controlled timing/failure.
export async function installOwnAi(page:Page,options:Options={}) {
  if(options.worker)await page.route('**/src/features/characters/ownAi/worker.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    let settings=${JSON.stringify(options.worker)},calls=0;const pending=new Map();
    const reply=job=>{pending.delete(job.id);self.postMessage(settings.error?
      {id:job.id,type:'error',error:settings.error}:{id:job.id,type:'reply',line:job.input.characterId+' '+job.input.action+' 새 반응 '+job.call,generationMs:5});};
    self.onmessage=({data})=>{
      if(data.configure){settings={...settings,...data.configure};return;}
      if(data.finish){for(const job of pending.values())reply(job);return;}
      if(!data.input)return;const job={...data,call:++calls};pending.set(job.id,job);
      if(!settings.controlled)setTimeout(()=>reply(job),settings.delay||0);
    };self.postMessage({type:'ready',loadMs:5,bytes:449148});
  `}));
  await page.addInitScript(settings=>{
    Math.random=()=>settings.sleeping?.55:.1;
    const probe=(window as any).ownAiProbe={requests:[] as any[],native:[] as string[],saveStarted:0,saveError:Boolean(settings.saveError),worker:null as Worker|null};
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker {
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/characters/ownAi/worker.ts'))probe.worker=this;}
      postMessage(message:any,options?:any){if(message?.input)probe.requests.push(message.input);super.postMessage(message,options);}
    };
    let interacted=false,disturbances=0;
    const characters=['gomi','potato'].map(id=>({id,customName:null,growthStage:6,affection:settings.affection??75,isMain:id===(settings.characterId??'gomi')}));
    const snapshot=()=>({characters:characters.map(owned=>({...owned})),events:[]});
    (window as any).__TAURI_INTERNALS__={convertFileSrc:()=>'/favicon.png',invoke:async(command:string,args:any={})=>{
      probe.native.push(command);
      if(command==='check_android_location_setup')return {locationEnabled:true,photoLocationGranted:true};
      if(command==='sync_characters')return snapshot();
      if(command==='interact_character'){
        probe.saveStarted++;
        if(settings.interactionDelay)await new Promise(resolve=>setTimeout(resolve,settings.interactionDelay));
        if(probe.saveError)throw new Error('fixture relationship save failed');
        const owned=characters.find(row=>row.id===args.id)!;
        if(args.source==='home'&&!interacted){owned.affection++;interacted=true;}
        if(args.source==='sleep'&&disturbances<3){owned.affection=Math.max(0,owned.affection-1);disturbances++;}
        return snapshot();
      }
      if(command==='set_main_character'){for(const owned of characters)owned.isMain=owned.id===args.id;return snapshot();}
      return [];
    }};
  },options);
}
export const requestedInputs=(page:Page)=>page.evaluate(()=>(window as any).ownAiProbe.requests);
export const configureInference=(page:Page,configure:Record<string,unknown>)=>page.evaluate(configure=>(window as any).ownAiProbe.worker.postMessage({configure}),configure);
