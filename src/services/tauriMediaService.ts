import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem, MediaType, SavedAlbum } from "../types/media";

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
}

interface BackendAlbum {
  id: number;
  title: string;
  description: string;
  cover_color: string;
  created_at: string;
  items: BackendMediaItem[];
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
  }));
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
  await invoke("update_album", { id: Number(album.id), title: album.title, coverColor: album.coverColor, mediaIds: album.items.map((item) => Number(item.id)) });
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
    tags: [],
    thumbnail: placeholders[row.file_type],
    metadataStatus: row.metadata_status,
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
