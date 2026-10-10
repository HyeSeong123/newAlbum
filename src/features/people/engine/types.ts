export const FACE_MODEL = 'face-api-1.7.15-ssd-68-resnet-v1';
export const PERSON_ENGINE = 'gamjassak-people-v1';
export type FaceBackend = 'auto' | 'cpu' | 'wasm';
export interface FaceFeatures {
  descriptor: number[];
  additionalFeatures?:{modelVersion:string;dimensions:512;descriptor:number[]}[];
  thumbnail: string;
  modelVersion: string;
  box: [number, number, number, number];
  quality: 'usable' | 'review';
  // Approximate geometry; actual orientation accuracy is evaluated separately.
  view: import('./pose').FaceView;
  pose: import('./pose').FacePose;
  rollDegrees: number;
}
export interface FaceDiagnostics {
  backend: string; elapsedMs: number; modelLoadMs: number;
  tensors: number; tensorBytes: number; simd: boolean;
}
export interface FaceModelAdapter {
  loadModel(base: string, backend: FaceBackend): Promise<void>;
  detectFaces(image: OffscreenCanvas): Promise<FaceFeatures[]>;
  extractDescriptor(image: OffscreenCanvas): Promise<number[]>;
  disposeModel(): void;
  getModelVersion(): string;
}
