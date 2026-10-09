export const ENGINE_VERSION = 'gamjassak-pets-v2';
export type PetKind = 'dog' | 'cat';
export type PetView = 'front' | 'left' | 'right' | 'rear' | 'unknown';
export const VIEW_LABELS: Record<PetView, string> = { front: '정면', left: '왼쪽 측면', right: '오른쪽 측면', rear: '뒷모습', unknown: '방향 미확인' };
export interface PetFeatures {
  kind: PetKind;
  detectedKind?: PetKind; // original model species; retained when a user corrects kind
  view: PetView;
  viewSource: 'unknown' | 'user';
  box: [number, number, number, number]; // normalized x/y/width/height
  detectionScore: number; // dog/cat detection, never identity probability
  appearance: number[]; // whole animal embedding, NOT facial landmarks
  mirroredAppearance: number[];
  faceBox?: [number, number, number, number]; // user-selected region in the oriented image
  faceAppearance?: number[]; // same MobileNet extractor, NOT facial landmarks or calibrated identity
  mirroredFaceAppearance?: number[];
  color: number[]; // RGB spatial histogram, crop/background can affect it
  shape: number[]; // coarse crop geometry/foreground proxy, NOT anatomy
}
export interface PetDetection extends PetFeatures {
  id: number;
  media_id: number;
  pet_id: number | null;
  excluded: boolean;
}
export interface PetReference { petId: number; features: PetFeatures }
export interface PetCandidate { petId: number; score: number; basis: 'appearance' | 'face-appearance' | 'shape-color' }
export type RecognitionState = 'confirmed' | 'needs-review' | 'unregistered' | 'rear-review';
export interface RecognitionResult { state: RecognitionState; candidates: PetCandidate[]; autoPetId: null }
export interface ScanRecord { media_id: number; engine_version: string; source_key: string; detections: PetDetection[] }
export interface PetDetector { detect(image: ImageBitmap): Promise<PetFeatures[]> }
export interface ViewAnalyzer { analyze(): { view: PetView; viewSource: 'unknown' | 'user' } }
// No licensed/validated pose model is bundled yet. Abstain instead of guessing.
export const conservativeViewAnalyzer: ViewAnalyzer = { analyze: () => ({ view: 'unknown', viewSource: 'unknown' }) };
