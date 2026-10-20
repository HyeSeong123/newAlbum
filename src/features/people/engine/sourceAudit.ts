import { invoke } from '@tauri-apps/api/core';
export type SourceAuditItem = {mediaId:number;state:'verified'|'legacy'|'source_changed'|'model_changed'|'unavailable'};
export async function auditPersonSources(signal:AbortSignal,referencesOnly:boolean,onBatch:(items:SourceAuditItem[])=>void){
 let afterId=0;
 for(;;){
  signal.throwIfAborted();
  const batch=await invoke<{items:SourceAuditItem[];nextCursor:number;done:boolean}>('audit_person_scans',{afterId,limit:20,referencesOnly});
  if (!batch || !Array.isArray(batch.items) || typeof batch.done !== 'boolean'
      || !batch.done && (!Number.isSafeInteger(batch.nextCursor) || batch.nextCursor <= afterId)) {
    throw new Error('사진 확인 결과를 읽지 못했습니다. 앱을 다시 실행한 뒤 시도해 주세요.');
  }
  onBatch(batch.items);signal.throwIfAborted();
  if(batch.done)return;
  afterId=batch.nextCursor;
 }
}
