import type { AlbumContent, MediaItem, SavedAlbum } from "../../../types/media";
import { albumContents } from "../albumContent";

export type StoryScene = { entry: AlbumContent; media?: MediaItem };
export function storyScenes(album: Pick<SavedAlbum, "items" | "contents">): StoryScene[] {
  const byId = new Map(album.items.map(item => [item.id, item]));
  return albumContents(album).map(entry => ({ entry: { ...entry,
    displayDuration: Number.isFinite(entry.displayDuration) ? Math.min(600, Math.max(1, entry.displayDuration)) : 5,
    transitionType: ["fade", "slide", "zoom"].includes(entry.transitionType) ? entry.transitionType : "fade",
  }, media: byId.get(entry.mediaId ?? "") }));
}
export function adjacentPhotos(scenes: StoryScene[], index: number): MediaItem[] {
  return [scenes[index - 1], scenes[index + 1]].flatMap(scene => scene?.media?.fileType === "image" ? [scene.media] : []);
}
export function albumDateRange(items: MediaItem[]): string {
  const dates = items.flatMap(item => item.takenAt ? [item.takenAt.slice(0, 10)] : []).sort();
  return dates.length ? dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}` : "";
}
