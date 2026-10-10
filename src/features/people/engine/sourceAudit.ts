import { invoke } from '@tauri-apps/api/core';
export type SourceAuditItem = {mediaId:number;state:'verified'|'legacy'|'source_changed'|'model_changed'|'unavailable'};
export async function auditPersonSources(signal:AbortSignal,referencesOnly:boolean,onBatch:(items:SourceAuditItem[])=>void){
 let afterId=0;
 for(;;){
  signal.throwIfAborted();
  const batch=await invoke<{items:SourceAuditItem[];nextCursor:number;done:boolean}>('audit_person_scans',{afterId,limit:20,referencesOnly});
  onBatch(batch.items);signal.throwIfAborted();
  if(batch.done)return;
  if(batch.nextCursor<=afterId)throw new Error('Source audit did not advance');
  afterId=batch.nextCursor;
 }
}
