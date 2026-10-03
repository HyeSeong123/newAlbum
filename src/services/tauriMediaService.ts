import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { AlbumContent, MediaItem, MediaType, SavedAlbum } from "../types/media";
import { albumContents } from "../features/albums/albumContent";

interface BackendContent {
  id: string; kind: AlbumContent["kind"]; media_id: number | null; title: string; body: string;
  display_duration: number; transition_type: AlbumContent["transitionType"]; comment_visible: boolean;
}

interface BackendMediaItem {
  id: number;
  file_path: string;
  title?: string;
  file_type: MediaType;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  size_bytes: number;
  rating: number;
  comment: string;
  favorite: boolean;
  view_count?: number;
  metadata_status: "ready" | "queued" | "missing-date";
  location_source?: "gps" | "manual";
  gps_region_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  region_code?: string | null;
  region_name?: string | null;
  district?: string | null; country?: string | null; city?: string | null;
  location_status?: "queued" | "ready" | "no-gps" | "outside-korea" | "failed";
}

interface BackendAlbum {
  id: number;
  title: string;
  description: string;
  cover_color: string;
  created_at: string;
  items: BackendMediaItem[];
  contents?: BackendContent[];
  music_path?: string | null;
}

const placeholders: Record<MediaType, string> = {
  image: "#ECEEF1",
  video: "#E5E9ED",
  audio: "#E9EDEB",
};

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadRegisteredMedia(): Promise<MediaItem[]> {
  const rows = await invoke<BackendMediaItem[]>("list_media");
  return rows.map(toMediaItem);
}

export async function loadSavedAlbums(): Promise<SavedAlbum[]> {
  const rows = await invoke<BackendAlbum[]>("list_albums");
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    description: row.description,
    coverColor: row.cover_color,
    createdAt: row.created_at,
    items: row.items.map(toMediaItem),
    musicPath: row.music_path ?? undefined,
    contents: row.contents?.map(entry => ({
      id: entry.id, kind: entry.kind, mediaId: entry.media_id == null ? undefined : String(entry.media_id),
      title: entry.title, body: entry.body, displayDuration: entry.display_duration,
      transitionType: entry.transition_type, commentVisible: entry.comment_visible,
    })),
  }));
}

export interface RegionCount { code: string; name: string; photos: number; videos: number }
export interface LocationOverview {
  total: number; analyzed: number; pending: number; failed: number; unclassified: number;
  regions: RegionCount[];
}

export async function loadLocationOverview(): Promise<LocationOverview> {
  return invoke<LocationOverview>("location_overview");
}
export async function analyzeLocationBatch(): Promise<LocationOverview> {
  return invoke<LocationOverview>("analyze_locations");
}
export async function queueFailedLocations(): Promise<LocationOverview> {
  return invoke<LocationOverview>("queue_failed_locations");
}
export interface RegionFilters { fileType: "all" | "image" | "video"; year: string; oldest: boolean; district: string }
export interface RegionPage { items: MediaItem[]; total: number; years: string[] }
export async function loadRegionPage(regionCode: string, offset: number, filters: RegionFilters): Promise<RegionPage> {
  const page = await invoke<{ items: BackendMediaItem[]; total: number; years: string[] }>("region_media_page", { regionCode, offset, ...filters });
  return { ...page, items: page.items.map(toMediaItem) };
}
export async function assignMediaRegion(ids: string[], regionCode: string, district = "", country = "", city = ""): Promise<void> {
  if (!ids.length || ids.some(id => !/^\d+$/.test(id))) throw new Error("올바르지 않은 기록입니다.");
  await invoke("assign_media_region", { ids: ids.map(Number), regionCode, district, country, city });
}

export async function clearRegisteredMedia(): Promise<MediaItem[]> {
  const rows = await invoke<BackendMediaItem[]>("clear_registered_media");
  return rows.map(toMediaItem);
}

export async function deleteRegisteredMedia(ids: string[]): Promise<MediaItem[]> {
  const numericIds = ids.filter((id) => /^\d+$/.test(id)).map(Number);
  if (!numericIds.length) return loadRegisteredMedia();
  const rows = await invoke<BackendMediaItem[]>("delete_registered_media", { ids: numericIds });
  return rows.map(toMediaItem);
}

export async function createAlbumFromMedia(title: string, ids: string[], coverColor: string): Promise<number | null> {
  const mediaIds = ids.filter((id) => /^\d+$/.test(id)).map(Number);
  if (!mediaIds.length) return null;
  return invoke<number>("create_album_from_media", { title, mediaIds, coverColor });
}

export async function saveAlbum(album: SavedAlbum): Promise<void> {
  await invoke("update_album", { id: Number(album.id), title: album.title, coverColor: album.coverColor,
    musicPath: album.musicPath ?? "",
    mediaIds: album.items.map((item) => Number(item.id)),
    contents: albumContents(album).map(entry => ({
      id: entry.id, kind: entry.kind, media_id: entry.mediaId ? Number(entry.mediaId) : null,
      title: entry.title, body: entry.body, display_duration: entry.displayDuration,
      transition_type: entry.transitionType, comment_visible: entry.commentVisible,
    })),
  });
}

export async function deleteAlbums(ids: string[]): Promise<void> {
  await invoke("delete_albums", { ids: ids.map(Number) });
}

export async function chooseAndRegisterFiles(): Promise<MediaItem[]> {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "미디어", extensions: ["jpg", "jpeg", "png", "webp", "heic", "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac", "m4a"] }],
  });
  return registerSelection(selected);
}

export async function chooseAndRegisterFolder(): Promise<MediaItem[]> {
  const selected = await open({
    multiple: false,
    directory: true,
  });
  return registerSelection(selected);
}

export interface MediaExportResult {
  directory: string;
  copied: number;
}

export async function chooseExportDestination(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
    title: "내보낼 위치 선택",
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}

export async function exportMediaGroup(items: MediaItem[], destinationRoot: string, folderName: string): Promise<MediaExportResult> {
  const sourcePaths = [...new Set(items.map((item) => item.filePath).filter(Boolean))];
  return invoke<MediaExportResult>("export_media_group", { sourcePaths, destinationRoot, folderName });
}

export async function downloadMedia(item: MediaItem): Promise<boolean> {
  if (item.previewUrl) {
    const link = document.createElement("a");
    link.href = item.previewUrl;
    link.download = item.fileName;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
    return true;
  }
  if (!isTauriRuntime() || !/^\d+$/.test(item.id) || !item.filePath) {
    throw new Error("다운로드할 원본 파일을 찾을 수 없습니다.");
  }
  const extension = item.fileName.split(".").pop();
  const destination = await save({
    title: "원본 사진 저장",
    defaultPath: item.fileName,
    ...(extension && extension !== item.fileName ? { filters: [{ name: "원본 사진", extensions: [extension] }] } : {}),
  });
  if (!destination) return false;
  await invoke("download_media", { id: Number(item.id), destination });
  return true;
}

export async function saveMediaDetails(item: MediaItem): Promise<void> {
  if (!/^\d+$/.test(item.id)) return;
  await invoke("update_media_details", {
    id: Number(item.id),
    rating: item.rating,
    comment: item.comment,
    favorite: item.favorite,
  });
}

export async function saveMediaTitle(id: string, title: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error("저장할 사진을 찾을 수 없습니다.");
  await invoke("update_media_title", { id: Number(id), title });
}

export async function incrementMediaView(id: string): Promise<number> {
  if (!/^\d+$/.test(id)) return 0;
  return invoke<number>("increment_media_view", { id: Number(id) });
}

async function registerSelection(selection: string | string[] | null): Promise<MediaItem[]> {
  if (!selection) return [];
  const paths = Array.isArray(selection) ? selection : [selection];
  const rows = await invoke<BackendMediaItem[]>("register_paths", { paths });
  return rows.map(toMediaItem);
}

function toMediaItem(row: BackendMediaItem): MediaItem {
  const fileName = row.file_path.split(/[\\/]/).pop() ?? row.file_path;
  return {
    id: String(row.id),
    fileName,
    title: row.title ?? "",
    filePath: row.file_path,
    fileType: row.file_type,
    takenAt: row.taken_at,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    duration: row.duration ? formatDuration(row.duration) : undefined,
    sizeLabel: formatBytes(row.size_bytes),
    rating: row.rating,
    comment: row.comment,
    favorite: row.favorite,
    viewCount: row.view_count ?? 0,
    thumbnail: placeholders[row.file_type],
    metadataStatus: row.metadata_status,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    regionCode: row.region_code ?? undefined,
    regionName: row.region_name ?? undefined,
    district: row.district ?? undefined, country: row.country ?? undefined, city: row.city ?? undefined,
    locationStatus: row.location_status ?? "queued",
    locationSource: row.location_source ?? "gps",
    gpsRegionCode: row.gps_region_code ?? undefined,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

import type { DiaryEntry as BackendDiaryEntry, DiaryPhoto } from "../features/diary/diaryModel";
export const listDiary = () => invoke<BackendDiaryEntry[]>("list_diary");
export const saveDiary = (entry: BackendDiaryEntry) => invoke<void>("save_diary", { entry });
export const assignDiaryAlbum = (ids: number[], albumId: number | null) => invoke<void>("assign_diary_album", { ids, albumId });
export const deleteDiary = (id: number) => invoke<void>("delete_diary", { id });

export async function chooseDiaryPhotos(remaining: number): Promise<DiaryPhoto[]> {
  const selected = await open({ multiple: true, directory: false, title: "일기에 담을 사진 선택",
    filters: [{ name: "사진", extensions: ["jpg", "jpeg", "png", "webp", "heic"] }] });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  if (paths.length > remaining) throw new Error("사진은 최대 6장까지 첨부할 수 있어요.");
  return invoke<DiaryPhoto[]>("import_diary_photos", { paths });
}
