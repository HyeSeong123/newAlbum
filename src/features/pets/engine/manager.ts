import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { normalizeLocalFilePath } from '../../media/mediaSource';
import type { MediaItem } from '../../../types/media';
import { ENGINE_VERSION, type PetDetection, type PetFeatures, type PetReference, type PetView, type ScanRecord } from './types';
import { loadPets } from '../petService';
import { analyzePetImage } from './client';
export const getPetScan = (mediaId: number) => invoke<ScanRecord | null>('get_pet_scan', { mediaId });
export const listPetDetections = (mediaId: number | null = null, afterId = 0, references = false, limit = 100) => invoke<PetDetection[]>('list_pet_detections', { mediaId, afterId, references, limit });
export const confirmPetDetection = (detectionId: number, petId: number | null, view: PetView, excluded = false) => invoke<void>('confirm_pet_detection', { detectionId, petId, view, excluded });
export async function loadPetReferences(): Promise<PetReference[]> {
  const references: PetReference[] = [];
  let after = 0;
  for (;;) {
    const rows = await listPetDetections(null, after, true);
    for (const row of rows) if (row.pet_id !== null && !row.excluded) references.push({ petId: row.pet_id, features: row });
    if (rows.length < 100) break;
    after = rows[rows.length - 1].id;
  }
  return references;
}
export async function scanPetPhoto(item: MediaItem, signal?: AbortSignal, viewHint: PetView = 'unknown'): Promise<ScanRecord> {
  signal?.throwIfAborted();
  const id = Number(item.id), sourceKey = `${item.filePath}:${item.sizeLabel}`;
  const previous = await getPetScan(id);
  if (previous) {
    if (previous.engine_version !== ENGINE_VERSION || previous.source_key !== sourceKey) throw new Error('사진 또는 분석 모델이 변경되었습니다. 기존 확인 결과를 보호하기 위해 재분석을 보류했습니다.');
    return previous;
  }
  const path = await invoke<string>('media_thumbnail', { id });
  if (!path) throw new Error('분석용 사진을 준비하지 못했습니다.');
  const features: PetFeatures[] = await analyzePetImage(convertFileSrc(normalizeLocalFilePath(path)), signal, viewHint);
  signal?.throwIfAborted();
  return invoke<ScanRecord>('save_pet_scan', { mediaId: id, sourceKey, features });
}
export interface PetProgress { done: number; total: number; failed: number; detected: number; running: boolean; message: string }
export async function scanPetBatch(items: MediaItem[], signal: AbortSignal, progress: (value: PetProgress) => void, enrollment?: { petId: number; views: Record<string,PetView> }) {
  const photos = items.filter(item => item.fileType === 'image');
  let done = 0, failed = 0, detected = 0, lastError = '';
  for (const item of photos) {
    if (signal.aborted) break;
    progress({ done, total: photos.length, failed, detected, running: true, message: `반려동물 확인 중 · ${item.fileName}` });
    try {
      const scan = await scanPetPhoto(item, signal, enrollment?.views[item.id]);
      if (enrollment && scan.detections.length === 1 && !scan.detections[0].excluded) {
        const owners = (await loadPets()).filter(pet => pet.media_ids.includes(Number(item.id)));
        const detection = scan.detections[0];
        // Explicitly selected single-animal reference photos can enroll features;
        // multi-animal/multi-owner photos always require object-level confirmation.
        if (owners.length === 1 && owners[0].id === enrollment.petId && (detection.pet_id === null || detection.pet_id === enrollment.petId)) {
          signal.throwIfAborted();
          await confirmPetDetection(detection.id,enrollment.petId,enrollment.views[item.id] ?? detection.view);
          detection.pet_id = enrollment.petId;
        }
      }
      detected += scan.detections.filter(d => !d.excluded && d.pet_id === null).length;
    }
    catch (error) { if (signal.aborted) break; failed++; lastError = error instanceof Error ? error.message : String(error); }
    done++;
    window.dispatchEvent(new Event('gamjassak-pet-results'));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  progress({ done, total: photos.length, failed, detected, running: false,
    message: signal.aborted ? '반려동물 분석을 중단했습니다. 완료한 결과는 저장되었습니다.' : `반려동물 확인 필요 ${detected}마리 · ${done}장 확인${failed ? ` · 실패 ${failed}장 (${lastError})` : ''}` });
}
