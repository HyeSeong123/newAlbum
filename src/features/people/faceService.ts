import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';
import { normalizeLocalFilePath } from '../media/mediaSource';

export interface FaceRow { id: number; media_id: number; person_id: number; thumbnail: string; confirmed: boolean; pose?:{automatic:import('./engine/pose').FacePose;manualView:import('./engine/pose').FaceView|null}|null }
export interface FaceIndex { people: { id: number; name: string; cover_face_id?: number | null }[]; faces: FaceRow[]; scanned: number[] }
export const emptyFaceIndex: FaceIndex = { people: [], faces: [], scanned: [] };
export const loadFaceIndex = () => invoke<FaceIndex>('list_face_index');
export const renamePerson = (id: number, name: string) => invoke('rename_face_person', { id, name });
export const setPersonCoverFace = (personId: number, faceId: number) => invoke('set_person_cover_face', { personId, faceId });
export const moveFaces = (ids: number[], target: number | null) => invoke('move_faces', { ids, target });
export const clearFaceIndex = () => invoke('clear_face_index');
export const retryEmptyFaceScans = () => invoke<number[]>('retry_empty_face_scans');
export interface FaceMatch { face_id: number; person_id: number; candidates?: {person_id:number;distance:number;references:number}[]; state?: string }
export const findFaceMatches = () => invoke<FaceMatch[]>('find_face_matches');
export const setFacesExcluded = (ids: number[], excluded: boolean) => invoke('set_faces_excluded', { ids, excluded });

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
