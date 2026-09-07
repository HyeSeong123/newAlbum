export type MediaType = "image" | "video" | "audio";

export interface MediaItem {
  id: string;
  fileName: string;
  filePath: string;
  fileType: MediaType;
  takenAt: string | null;
  width?: number;
  height?: number;
  duration?: string;
  sizeLabel: string;
  rating: number;
  comment: string;
  favorite: boolean;
  tags: string[];
  thumbnail: string;
  metadataStatus: "ready" | "queued" | "missing-date";
}

export interface SavedAlbum {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  coverColor: string;
  items: MediaItem[];
}
