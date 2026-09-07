import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';

export interface FaceRow { id: number; media_id: number; person_id: number; thumbnail: string; confirmed: boolean }
export interface FaceIndex { people: { id: number; name: string }[]; faces: FaceRow[]; scanned: number[] }
export const emptyFaceIndex: FaceIndex = { people: [], faces: [], scanned: [] };
export const loadFaceIndex = () => invoke<FaceIndex>('list_face_index');
export const renamePerson = (id: number, name: string) => invoke('rename_face_person', { id, name });
export const moveFaces = (ids: number[], target: number | null) => invoke('move_faces', { ids, target });
export const clearFaceIndex = () => invoke('clear_face_index');
export interface FaceMatch { face_id: number; person_id: number }
export const findFaceMatches = () => invoke<FaceMatch[]>('find_face_matches');
export const setFacesExcluded = (ids: number[], excluded: boolean) => invoke('set_faces_excluded', { ids, excluded });

let engine: Promise<typeof import('@vladmandic/face-api')> | undefined;
export function loadFaceEngine() {
  engine ??= (async () => {
    const api = await import('@vladmandic/face-api');
    await Promise.all([
      api.nets.ssdMobilenetv1.loadFromUri('/models/faces'),
      api.nets.faceLandmark68Net.loadFromUri('/models/faces'),
      api.nets.faceRecognitionNet.loadFromUri('/models/faces'),
    ]);
    return api;
  })().catch((error) => { engine = undefined; throw error; });
  return engine;
}

export function localPhotoUrl(path: string) {
  const normalized = path.startsWith('\\\\?\\UNC\\') ? `\\\\${path.slice(8)}` : path.startsWith('\\\\?\\') ? path.slice(4) : path;
  return convertFileSrc(normalized);
}

let detectionQueue: Promise<unknown> = Promise.resolve();

export function detectPhotoFaces(url: string) {
  // A departing view may still be finishing a photo when another view starts.
  const result = detectionQueue.then(() => detectSinglePhoto(url));
  detectionQueue = result.catch(() => undefined);
  return result;
}

async function detectSinglePhoto(url: string) {
  const api = await loadFaceEngine();
  const photo = new Image();
  photo.crossOrigin = 'anonymous';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { photo.src = ''; reject(new Error('사진 읽기 시간 초과')); }, 30_000);
      photo.onload = () => { clearTimeout(timer); resolve(); };
      photo.onerror = () => { clearTimeout(timer); reject(new Error('사진을 읽을 수 없습니다.')); };
      photo.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const detected = await api.detectAllFaces(canvas, new api.SsdMobilenetv1Options({ minConfidence: 0.65, maxResults: 100 })).withFaceLandmarks().withFaceDescriptors();
    return detected.map((face) => {
      const { x, y, width, height } = face.detection.box;
      const size = Math.min(Math.max(width, height) * 1.35, canvas.width, canvas.height);
      const left = Math.max(0, Math.min(canvas.width - size, x + width / 2 - size / 2));
      const top = Math.max(0, Math.min(canvas.height - size, y + height / 2 - size / 2));
      const crop = document.createElement('canvas');
      crop.width = crop.height = 144;
      crop.getContext('2d')!.drawImage(canvas, left, top, size, size, 0, 0, 144, 144);
      return { descriptor: Array.from(face.descriptor), thumbnail: crop.toDataURL('image/jpeg', 0.8) };
    });
  } finally { photo.src = ''; photo.onload = photo.onerror = null; }
}

export async function scanPhoto(item: MediaItem) {
  const faces = await detectPhotoFaces(localPhotoUrl(item.filePath));
  await invoke('save_face_scan', { mediaId: Number(item.id), faces });
}
