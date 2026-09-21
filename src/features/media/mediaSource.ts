import type { MediaItem } from "../../types/media";

export function resolveMediaSource(
  item: Pick<MediaItem, "filePath" | "previewUrl">,
  convertLocalFile?: (path: string) => string,
): string | null {
  if (item.previewUrl) return item.previewUrl;
  if (!item.filePath || !convertLocalFile) return null;
  return convertLocalFile(normalizeLocalFilePath(item.filePath));
}

export function normalizeLocalFilePath(filePath: string): string {
  if (filePath.startsWith("\\\\?\\UNC\\")) return `\\\\${filePath.slice("\\\\?\\UNC\\".length)}`;
  if (filePath.startsWith("\\\\?\\")) return filePath.slice("\\\\?\\".length);
  return filePath;
}
