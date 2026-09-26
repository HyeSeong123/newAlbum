import type { MediaItem } from "../../types/media";
import { getMediaType } from "./mediaService";

export function browserImportItems(files: Iterable<File>, existing: MediaItem[], createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL): MediaItem[] {
  const knownPaths = new Set(existing.map((item) => item.filePath));
  const added: MediaItem[] = [];
  try {
    for (const file of files) {
      const fileType = getMediaType(file.name);
      const filePath = `선택한 로컬 파일/${file.webkitRelativePath || file.name}`;
      if (!fileType || knownPaths.has(filePath)) continue;
      knownPaths.add(filePath);
      added.push({
        id: `local-${crypto.randomUUID()}`, fileName: file.name, filePath, fileType,
        takenAt: new Date(file.lastModified).toISOString().slice(0, 10),
        sizeLabel: `${Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB`,
        title: "", rating: 0, comment: "", favorite: false, viewCount: 0, tags: ["new"],
        thumbnail: "#eae9e1", metadataStatus: "queued", previewUrl: createUrl(file),
      });
    }
    return added;
  } catch (error) {
    added.forEach((item) => { if (item.previewUrl) revokeUrl(item.previewUrl); });
    throw error;
  }
}

export function retainMediaEdits(registered: MediaItem[], current: MediaItem[]): MediaItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  return registered.map((item) => {
    const edited = byId.get(item.id);
    return edited ? { ...item, ...(edited.title !== undefined ? { title: edited.title } : {}), rating: edited.rating, comment: edited.comment, favorite: edited.favorite, viewCount: edited.viewCount } : item;
  });
}
