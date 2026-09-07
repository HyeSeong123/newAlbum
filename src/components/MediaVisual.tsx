import type { ReactNode } from "react";
import { Image } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../services/tauriMediaService";
import type { MediaItem } from "../types/media";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="emptyState">
      <Image size={28} />
      <p>{text}</p>
    </div>
  );
}

export function MediaVisual({ item, className, children }: { item: MediaItem; className?: string; children?: ReactNode }) {
  return (
    <div className={className} style={{ background: item.thumbnail }}>
      <MediaImage item={item} />
      {children}
    </div>
  );
}

export function MediaImage({ item }: { item: MediaItem }) {
  const src = getImageSrc(item);
  if (!src) return null;
  return <img className="mediaImage" src={src} alt="" loading="lazy" draggable={false} />;
}

function getImageSrc(item: MediaItem): string | null {
  if (item.fileType !== "image") return null;
  if (!isTauriRuntime()) return null;
  return convertFileSrc(normalizeLocalFilePath(item.filePath));
}

function normalizeLocalFilePath(filePath: string): string {
  if (filePath.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${filePath.slice("\\\\?\\UNC\\".length)}`;
  }

  if (filePath.startsWith("\\\\?\\")) {
    return filePath.slice("\\\\?\\".length);
  }

  return filePath;
}
