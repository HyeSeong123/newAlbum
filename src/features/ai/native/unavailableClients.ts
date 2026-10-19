// Vite native-mode build boundary. Legacy client modules (and their Worker URL
// imports) are never transformed, so orphan pretrained-runtime bundles cannot
// be emitted even when Rollup later removes an unreachable branch.
import { NATIVE_AI_MESSAGE } from './engines';
import type { FaceBackend, FaceDiagnostics, FaceFeatures } from '../../people/engine/types';
import type { PetFeatures, PetView } from '../../pets/engine/types';
import type { PetBackendPreference } from '../../pets/engine/runtime';
export interface PetDiagnostics { elapsedMs: number; totalMs: number; backend: string; simd: boolean; tensors: number; tensorBytes: number; faceDetectionMs?: number; faceEmbeddingMs: number }
export function disposePersonEngine() { /* No legacy Worker exists in native mode. */ }
export function cancelPetInference() { /* No legacy Worker exists in native mode. */ }
export function loadPersonEngine(_signal?: AbortSignal): Promise<FaceFeatures[]> { return Promise.reject(new Error(NATIVE_AI_MESSAGE)); }
export function analyzePersonImage(_url: string, _signal?: AbortSignal, _backend?: FaceBackend, _diagnostics?: (value: FaceDiagnostics) => void): Promise<FaceFeatures[]> { return Promise.reject(new Error(NATIVE_AI_MESSAGE)); }
export function analyzePetImage(_url: string, _signal?: AbortSignal, _viewHint?: PetView, _regions?: PetFeatures[], _backend?: PetBackendPreference, _diagnostics?: (value: PetDiagnostics) => void): Promise<PetFeatures[]> { return Promise.reject(new Error(NATIVE_AI_MESSAGE)); }
