import { invoke } from '@tauri-apps/api/core';
export interface NativeStoredFeature {
  mediaId: number; regionKey: string; modelKey: string; sourceKey: string;
  view: 'front' | 'left' | 'right' | 'rear' | 'unknown'; vector: number[];
  faceId: number | null; petDetectionId: number | null;
}
// No caller saves synthetic output; native registry must contain a separately
// reviewed real task model before this future integration seam accepts a write.
export const saveNativeFeature = (feature: NativeStoredFeature) => invoke<void>('save_native_ai_feature', { feature });
export const listNativeFeatures = (mediaId: number, modelKey: string, sourceKey: string, afterRegion: string | null = null) => invoke<NativeStoredFeature[]>('list_native_ai_features', { mediaId, modelKey, sourceKey, afterRegion });
