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

export interface ImportJob {
  id: string;
  name: string;
  status: "검사" | "메타데이터" | "썸네일" | "등록 완료";
  progress: number;
}
