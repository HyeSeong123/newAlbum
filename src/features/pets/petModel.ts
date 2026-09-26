import type { MediaItem } from "../../types/media";
import type { Pet } from "./petService";

export function petPhotos(photos: MediaItem[], pet: Pet | undefined): MediaItem[] {
  if (!pet) return [];
  const ids = new Set(pet.media_ids);
  return photos.filter((photo) => ids.has(Number(photo.id)));
}

export function petCovers(photos: MediaItem[], pets: Pet[]): Map<number, MediaItem> {
  const positions = new Map(photos.map((photo, index) => [Number(photo.id), index]));
  const covers = new Map<number, MediaItem>();
  for (const pet of pets) {
    let position = pet.cover_media_id === null ? undefined : positions.get(pet.cover_media_id);
    if (position === undefined) {
      // Preserve library-order fallback, not the order in which photos were linked.
      for (const id of pet.media_ids) {
        const candidate = positions.get(id);
        if (candidate !== undefined && (position === undefined || candidate < position)) position = candidate;
      }
    }
    if (position !== undefined) covers.set(pet.id, photos[position]);
  }
  return covers;
}
