import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem, MediaType } from "../types/media";

interface BackendMediaItem {
  id: number;
  file_path: string;
  file_type: MediaType;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  size_bytes: number;
  rating: number;
  comment: string;
  favorite: boolean;
  metadata_status: "ready" | "queued" | "missing-date";
}

const gradients: Record<MediaType, string> = {
  image: "linear-gradient(135deg, #efe0c1 0%, #bac6b5 52%, #6d8f7c 100%)",
  video: "linear-gradient(135deg, #60747d 0%, #bbc2af 52%, #e5cf96 100%)",
  audio: "linear-gradient(135deg, #5d5d50 0%, #c9b578 100%)",
};

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadRegisteredMedia(): Promise<MediaItem[]> {
  const rows = await invoke<BackendMediaItem[]>("list_media");
  return rows.map(toMediaItem);
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

export async function createAlbumFromMedia(title: string, ids: string[]): Promise<number | null> {
  const mediaIds = ids.filter((id) => /^\d+$/.test(id)).map(Number);
  if (!mediaIds.length) return null;
  return invoke<number>("create_album_from_media", { title, mediaIds });
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

export async function saveMediaDetails(item: MediaItem): Promise<void> {
  if (!/^\d+$/.test(item.id)) return;
  await invoke("update_media_details", {
    id: Number(item.id),
    rating: item.rating,
    comment: item.comment,
    favorite: item.favorite,
  });
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
    tags: [],
    thumbnail: gradients[row.file_type],
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
