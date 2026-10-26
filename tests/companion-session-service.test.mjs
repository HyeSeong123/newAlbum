import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=readFileSync(new URL('../src/features/characters/companionChatService.ts',import.meta.url),'utf8')
 .replace('import { invoke } from "@tauri-apps/api/core";', 'const invoke = (command, args) => globalThis.sessionBridge(command, args);')
 .replace('import { isTauriRuntime } from "../../services/tauriMediaService";', 'const isTauriRuntime = () => true;');
const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const service=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('a delayed old stop must settle before another character generates in the shared Home session',async()=>{
 let finishFirst,finishStop;const entered=[];
 globalThis.sessionBridge=async(command,args)=>{
  if(command==='generate_chat_reply'){
   entered.push(args.prompt);
   if(args.prompt==='고미 터치')await new Promise(resolve=>{finishFirst=resolve;});
   return args.prompt+'의 새 대사';
  }
  if(command==='stop_chat_model')await new Promise(resolve=>{finishStop=resolve;});
 };
 const first=service.generateChatReply('고미 터치','home-one');await tick();
 const stopping=service.stopChatModel('home-one');await tick();
 finishFirst();await first;
 const second=service.generateChatReply('감자 터치','home-one');await tick();
 assert.deepEqual(entered,['고미 터치'],'a new request cannot overtake an older stop IPC');
 finishStop();await stopping;
 assert.equal(await second,'감자 터치의 새 대사');
 assert.deepEqual(entered,['고미 터치','감자 터치']);
});
test('an unsuccessful stop does not poison the next Home reaction',async()=>{
 globalThis.sessionBridge=async command=>{if(command==='stop_chat_model')throw Error('bridge stopped');return '다시 만든 대사';};
 await assert.rejects(service.stopChatModel('home-two'),/bridge stopped/);
 assert.equal(await service.generateChatReply('쉬기','home-two'),'다시 만든 대사');
});
