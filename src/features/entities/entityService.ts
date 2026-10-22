import { invoke } from '@tauri-apps/api/core';
export type Assignment = { target: number | null; name: string | null };
export const assignPersonFaces = (ids: number[], assignment: Assignment) => invoke<number>('assign_person_faces', { ids, ...assignment });
export const assignPetDetections = (ids: number[], assignment: Assignment) => invoke<number>('assign_pet_detections', { ids, ...assignment });
export const editEntityPhotos = (kind: 'person' | 'pet', source: number, ids: number[], action: 'move' | 'unknown' | 'exclude', assignment: Assignment = { target: null, name: null }) => invoke<number | null>('edit_entity_photo_links', { kind, source, ids, action, ...assignment });
export const setPersonCoverPhoto = (personId: number, mediaId: number) => invoke('set_person_cover_photo', { personId, mediaId });
export const removePersonRegistration = (id: number) => invoke('remove_person_registration', { id });

export const removeEntityRegistrations = (kind: 'person' | 'pet', ids: number[]) => invoke('remove_entity_registrations', { kind, ids });
