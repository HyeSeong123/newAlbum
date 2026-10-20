import { invoke } from '@tauri-apps/api/core';

export interface FaceRow { id: number; media_id: number; person_id: number; thumbnail: string; confirmed: boolean; pose?:{automatic:import('./engine/pose').FacePose;manualView:import('./engine/pose').FaceView|null}|null }
export interface FaceIndex { people: { id: number; name: string; cover_face_id?: number | null; media_ids?: number[] }[]; faces: FaceRow[]; scanned: number[] }
export const loadFaceIndex = () => invoke<FaceIndex>('list_face_index');
export const saveManualPersonPhotos = (personId: number | null, name: string, mediaIds: number[]) => invoke<number>('save_manual_person_photos', { personId, name, mediaIds });
export const mergeRegisteredPeople = (sources: number[], target: number) => invoke('merge_registered_people', { sources, target });
export const renamePerson = (id: number, name: string) => invoke('rename_face_person', { id, name });
export const setPersonCoverFace = (personId: number, faceId: number) => invoke('set_person_cover_face', { personId, faceId });
export const moveFaces = (ids: number[], target: number | null) => invoke('move_faces', { ids, target });
export const clearFaceIndex = () => invoke('clear_face_index');
export const setFacesExcluded = (ids: number[], excluded: boolean) => invoke('set_faces_excluded', { ids, excluded });
export const emptyFaceIndex: FaceIndex = { people: [], faces: [], scanned: [] };
