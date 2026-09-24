import type { MediaItem } from "../../types/media";
import type { FaceIndex, FaceRow } from "./faceService";

export const EMPTY_FACES: FaceRow[] = [];

export function indexFaces(index: FaceIndex) {
  const byPerson = new Map<number, FaceRow[]>();
  const peopleById = new Map(index.people.map((person) => [person.id, person]));
  const unidentified: FaceRow[] = [];
  for (const face of index.faces) {
    const group = byPerson.get(face.person_id) ?? [];
    group.push(face);
    byPerson.set(face.person_id, group);
    const person = peopleById.get(face.person_id);
    if (person && !person.name.trim()) unidentified.push(face);
  }
  return { byPerson, peopleById, unidentified, scanned: new Set(index.scanned) };
}

export function mediaForFaces(items: MediaItem[], faces: FaceRow[]): MediaItem[] {
  const ids = new Set(faces.map((face) => face.media_id));
  return items.filter((item) => ids.has(Number(item.id)));
}
