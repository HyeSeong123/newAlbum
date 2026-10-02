export type MediaType = "image" | "video" | "audio";

export interface MediaItem {
  id: string;
  fileName: string;
  /** User-written title; absent on records from older app versions. */
  title?: string;
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
  viewCount: number;
  thumbnail: string;
  /** Session-only URL for files selected in the browser preview. */
  previewUrl?: string;
  metadataStatus: "ready" | "queued" | "missing-date";
  locationSource?: "gps" | "manual";
  latitude?: number;
  longitude?: number;
  regionCode?: string;
  regionName?: string;
  district?: string;
  country?: string;
  city?: string;
  locationStatus?: "queued" | "ready" | "no-gps" | "outside-korea" | "failed";
}

export interface SavedAlbum {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  coverColor: string;
  items: MediaItem[];
  contents?: AlbumContent[];
  musicPath?: string;
}

export type AlbumContentKind = "PHOTO" | "VIDEO" | "AUDIO" | "CHAPTER" | "TEXT";
export interface AlbumContent {
  id: string;
  kind: AlbumContentKind;
  mediaId?: string;
  title: string;
  body: string;
  displayDuration: number;
  transitionType: "fade" | "slide" | "zoom";
  commentVisible: boolean;
}
