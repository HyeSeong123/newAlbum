import { validateImage, matchFeature, type Feature, type RGBImage } from './core';
export type Stage = 'face-detector' | 'face-landmark' | 'face-alignment' | 'face-orientation' | 'face-embedding-512' | 'pet-detector' | 'pet-species' | 'pet-face' | 'pet-pose' | 'pet-orientation' | 'pet-features';
export type Unavailable = { status: 'not-trained'; stage: Stage; results: null; needsReview: true; autoLink: false };
export type StageResult<T> = Unavailable | { status: 'ready'; stage: Stage; results: T; modelKey: string; needsReview: true; autoLink: false };
export interface Box { x: number; y: number; width: number; height: number } // normalized display coordinates [0,1]
export interface Point { x: number; y: number; confidence: number }
export interface FaceDetection { box: Box; confidence: number; quality: 'usable' | 'review' }
export interface Landmarks { leftEye: Point; rightEye: Point; nose: Point; leftMouth: Point; rightMouth: Point }
export interface Orientation { view: Feature['view']; yaw: number | null; confidence: number; evidence: 'landmarks' | 'muzzle' | 'unknown' }
export interface PetDetection { box: Box; species: 'dog' | 'cat' | 'unknown'; confidence: number }
export interface PetPose { points: Record<string, Point>; muzzle: Point | null; confidence: number }
export interface PetFeatures { identity: Feature | null; colorShape: Feature | null; faceBox: Box | null }
export const unavailable = (stage: Stage): Unavailable => ({ status: 'not-trained', stage, results: null, needsReview: true, autoLink: false });
// Future task boundaries and typed outputs; no synthetic stand-ins for real models.
// Optional inputs keep untrained capability queries cheap. A ready adapter must
// require/validate them and perform its own independently evaluated inference.
export class PersonEngine {
  detect(image: RGBImage): StageResult<FaceDetection[]> { validateImage(image); return unavailable('face-detector'); }
  landmarks(_image?: RGBImage, _face?: Box): StageResult<Landmarks> { return unavailable('face-landmark'); }
  align(_image?: RGBImage, _points?: Landmarks): StageResult<RGBImage> { return unavailable('face-alignment'); }
  orientation(_points?: Landmarks): StageResult<Orientation> { return unavailable('face-orientation'); }
  embedding512(_aligned?: RGBImage): StageResult<Feature> { return unavailable('face-embedding-512'); }
  match(query: Feature, reference: Feature) { if (query.task !== 'person') throw new Error('TASK_MISMATCH'); return matchFeature(query, reference); }
}
export class PetEngine {
  detect(image: RGBImage): StageResult<PetDetection[]> { validateImage(image); return unavailable('pet-detector'); }
  species(_image?: RGBImage, _animal?: Box): StageResult<'dog' | 'cat' | 'unknown'> { return unavailable('pet-species'); }
  face(_image?: RGBImage, _animal?: Box): StageResult<FaceDetection[]> { return unavailable('pet-face'); }
  pose(_image?: RGBImage, _animal?: Box): StageResult<PetPose> { return unavailable('pet-pose'); }
  orientation(_pose?: PetPose): StageResult<Orientation> { return unavailable('pet-orientation'); }
  features(_image?: RGBImage, _animal?: PetDetection, _view?: Orientation): StageResult<PetFeatures> { return unavailable('pet-features'); }
  match(query: Feature, reference: Feature) { if (query.task !== 'pet') throw new Error('TASK_MISMATCH'); return matchFeature(query, reference); }
}
export const NATIVE_AI_MESSAGE = '자체 AI 인식 모델은 아직 학습되지 않았습니다. 기존 사진과 연결은 유지됩니다. 사진을 직접 선택해 등록할 수 있습니다.';
