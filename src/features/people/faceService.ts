import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';
import { normalizeLocalFilePath } from '../media/mediaSource';

export async function relearnPersonPhoto(item: MediaItem, signal: AbortSignal) {
  const source = await invoke<{source_key:string}>('get_person_scan_source', { mediaId:Number(item.id) });
  const faces = await analyzePersonImage(convertFileSrc(normalizeLocalFilePath(item.filePath)), signal);
  signal.throwIfAborted();
  return invoke<{detected:number;learned:number}>('refresh_face_scan', { mediaId:Number(item.id), faces, sourceKey:source.source_key });
}
export const retryEmptyFaceScans = () => invoke<number[]>('retry_empty_face_scans');
export interface FaceMatch { face_id: number; person_id: number; candidates?: {person_id:number;distance:number;references:number}[]; state?: string }
export const findFaceMatches = () => invoke<FaceMatch[]>('find_face_matches');

export { loadPersonEngine as loadFaceEngine, analyzePersonImage as detectPhotoFaces } from './engine/client';
import { analyzePersonImage } from './engine/client';

export async function scanPhoto(item: MediaItem, signal?: AbortSignal) {
  const source = await invoke<{source_key:string;completed:boolean}>('get_person_scan_source', { mediaId:Number(item.id) });
  if (source.completed) return;
  const faces = await analyzePersonImage(convertFileSrc(normalizeLocalFilePath(item.filePath)), signal);
  signal?.throwIfAborted();
  await invoke('save_face_scan', { mediaId: Number(item.id), faces, sourceKey: source.source_key });
}

export async function enqueuePersonPhotos(items: MediaItem[]) {
  for (let start=0;start<items.length;start+=1000) await invoke('enqueue_person_jobs', {mediaIds:items.slice(start,start+1000).map((item)=>Number(item.id))});
}
export const controlPersonJobs = (resume:boolean) => invoke('control_person_jobs',{resume});
export const finishPersonJob = (mediaId:number,failed:boolean) => invoke('finish_person_job',{mediaId,failed});

// Storage contracts remain available to isolated recognition research.
export * from './faceStorage';
