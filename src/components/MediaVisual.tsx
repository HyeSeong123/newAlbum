import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../services/tauriMediaService";
import type { MediaItem } from "../types/media";

const thumbnailRequests = new Map<string, { expires: number; request: Promise<string> }>();
function requestThumbnail(key: string, id: number): Promise<string> {
  const cached = thumbnailRequests.get(key);
  if (cached && cached.expires > Date.now()) return cached.request;
  const request = invoke<string>('media_thumbnail', { id }).catch((error) => {
    if (thumbnailRequests.get(key)?.request === request) thumbnailRequests.delete(key);
    throw error;
  });
  if (thumbnailRequests.size >= 512) thumbnailRequests.delete(thumbnailRequests.keys().next().value!);
  thumbnailRequests.set(key, { expires: Date.now() + 30_000, request });
  return request;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="emptyState">
      <Image size={28} />
      <p>{text}</p>
    </div>
  );
}

export function MediaVisual({ item, className, children, original = false }: { item: MediaItem; className?: string; children?: ReactNode; original?: boolean }) {
  return (
    <div className={className} style={{ background: item.thumbnail }}>
      <MediaImage item={item} original={original} />
      {children}
    </div>
  );
}

export function MediaImage({ item, original = false }: { item: MediaItem; original?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [thumbnail, setThumbnail] = useState<{ key: string; src: string } | null>(null);
  const key = `${item.id}:${item.filePath}`;
  const source = getImageSrc(item);
  useEffect(() => {
    if (original || !source || !ref.current) return;
    let alive = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void requestThumbnail(key, Number(item.id)).then((path) => {
        if (alive) setThumbnail({ key, src: path ? convertFileSrc(normalizeLocalFilePath(path)) : source });
      }).catch(() => { if (alive) setThumbnail({ key, src: source }); });
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); };
  }, [key, item.id, original, source]);
  if (!source) return null;
  const src = original ? source : thumbnail?.key === key ? thumbnail.src : undefined;
  return <img ref={ref} className="mediaImage" src={src} style={src ? undefined : { opacity: 0 }} alt="" loading={original ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => { if (src !== source) setThumbnail({ key, src: source }); }} />;
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
