import type { MediaItem, MediaType } from "../../types/media";

const mediaTypes: Record<string, MediaType> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", heic: "image",
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video",
  mp3: "audio", wav: "audio", flac: "audio", m4a: "audio",
};

export const MEDIA_FILE_ACCEPT = Object.keys(mediaTypes).map((extension) => `.${extension}`).join(",");

export function getMediaType(fileName: string): MediaType | null {
  const extension = fileName.match(/\.([^.]+)$/)?.[1].toLowerCase();
  return extension && Object.hasOwn(mediaTypes, extension) ? mediaTypes[extension] : null;
}

export function isSupportedMedia(fileName: string): boolean {
  return getMediaType(fileName) !== null;
}

export function groupByTakenDate(items: MediaItem[]) {
  return items.reduce<Record<string, MediaItem[]>>((groups, item) => {
    const key = item.takenAt ?? "날짜 없음";
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
}
