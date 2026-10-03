import type { MediaItem } from "../../types/media";
import { getMediaType } from "./mediaService";
import type { MediaImportProgress } from "./importProgress";

export function browserImportItems(files: Iterable<File>, existing: MediaItem[], createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL): MediaItem[] {
  return collectBrowserItems(files, existing, createUrl, revokeUrl);
}

function collectBrowserItems(files: Iterable<File>, existing: MediaItem[], createUrl: typeof URL.createObjectURL, revokeUrl: typeof URL.revokeObjectURL): MediaItem[] {
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
        title: "", rating: 0, comment: "", favorite: false, viewCount: 0,
        thumbnail: "#eae9e1", metadataStatus: "queued", previewUrl: createUrl(file),
      });
    }
    return added;
  } catch (error) {
    added.forEach((item) => { if (item.previewUrl) revokeUrl(item.previewUrl); });
    throw error;
  }
}

// Yield before starting and between batches so React can paint the loading
// screen and the browser can animate it even for a folder with many files.
export async function browserImportItemsAsync(files: File[], existing: MediaItem[], onProgress: (progress: MediaImportProgress) => void,
  createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL): Promise<MediaItem[]> {
  const added: MediaItem[] = [];
  const knownPaths = new Set(existing.map(item => item.filePath));
  const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 16));
  onProgress({ phase: "registering", processed: 0, total: files.length });
  await yieldToBrowser();
  try {
    for (let offset = 0; offset < files.length; offset += 128) {
      const batch = files.slice(offset, offset + 128).filter(file => {
        const path = `선택한 로컬 파일/${file.webkitRelativePath || file.name}`;
        if (knownPaths.has(path)) return false;
        knownPaths.add(path);
        return true;
      });
      added.push(...collectBrowserItems(batch, [], createUrl, revokeUrl));
      const processed = Math.min(offset + 128, files.length);
      onProgress({ phase: "registering", processed, total: files.length, fileName: files[processed - 1]?.name });
      await yieldToBrowser();
    }
    return added;
  } catch (error) {
    added.forEach(item => { if (item.previewUrl) revokeUrl(item.previewUrl); });
    throw error;
  }
}

export function retainMediaEdits(registered: MediaItem[], current: MediaItem[]): MediaItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  return registered.map((item) => {
    const edited = byId.get(item.id);
    return edited ? { ...item, ...(edited.locationSource === "manual" ? { regionCode: edited.regionCode, regionName: edited.regionName, district: edited.district, country: edited.country, city: edited.city, locationSource: edited.locationSource, locationStatus: edited.locationStatus } : {}), ...(edited.title !== undefined ? { title: edited.title } : {}), rating: edited.rating, comment: edited.comment, favorite: edited.favorite, viewCount: edited.viewCount } : item;
  });
}
