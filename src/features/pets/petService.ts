import { invoke } from '@tauri-apps/api/core';

export interface Pet { id: number; name: string; cover_media_id: number | null; media_ids: number[] }
export const loadPets = () => invoke<Pet[]>('list_pets');
export const savePet = (id: number | null, name: string, mediaIds: number[], coverMediaId: number | null) => invoke<number>('save_pet', { id, name, mediaIds, coverMediaId });
export const deletePet = (id: number) => invoke('delete_pet', { id });
