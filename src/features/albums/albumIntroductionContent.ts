import type { SavedAlbum } from "../../types/media";
import { albumContents } from "./albumContent";

/** Text-only source for a future offline introduction model.
 * Never pass reader-only diary pages, image bytes, paths or GPS coordinates.
 */
export function albumIntroductionText(album: SavedAlbum): { sections: string[]; hasStory: boolean } {
  const sections: string[] = [];
  const add = (label: string, value?: string) => {
    const text = value?.trim();
    if (text) sections.push(`${label}: ${text}`);
  };
  add("앨범 제목", album.title);
  add("앨범 설명", album.description);
  const byId = new Map(album.items.map(item => [item.id, item]));
  const entries = albumContents(album);
  const used = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "CHAPTER" || entry.kind === "TEXT") {
      add(entry.kind === "CHAPTER" ? "챕터 제목" : "편지 제목", entry.title);
      add(entry.kind === "CHAPTER" ? "챕터 내용" : "편지 내용", entry.body);
    } else {
      const media = byId.get(entry.mediaId ?? "");
      if (!media || used.has(media.id)) continue;
      used.add(media.id);
      add("사진 제목", media.title);
      add("사진 설명", media.comment);
    }
  }
  // Older albums may have media absent from a saved contents sequence.
  for (const media of album.items) {
    if (used.has(media.id)) continue;
    add("사진 제목", media.title);
    add("사진 설명", media.comment);
  }
  return { sections, hasStory: sections.some(section => !section.startsWith("앨범 제목:")) };
}
