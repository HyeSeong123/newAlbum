import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../services/tauriMediaService";
import type { MediaItem } from "../types/media";
import { normalizeLocalFilePath, resolveMediaSource } from "../features/media/mediaSource";

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

export function MediaVisual({ item, className, children, original = false, fit = "contain" }: { item: MediaItem; className?: string; children?: ReactNode; original?: boolean; fit?: "contain" | "cover" }) {
  return (
    <div className={`mediaVisual fit-${fit}${className ? ` ${className}` : ""}`} style={{ background: fit === "contain" ? "#eeede7" : item.thumbnail }}>
      <MediaImage item={item} original={original} />
      {children}
    </div>
  );
}

export function MediaImage({ item, original = false }: { item: MediaItem; original?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [thumbnail, setThumbnail] = useState<{ key: string; src: string } | null>(null);
  const key = `${item.id}:${item.filePath}`;
  const source = item.fileType === "image" ? getMediaSource(item) : null;
  useEffect(() => {
    if (original || item.previewUrl || !source || !ref.current) return;
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
  }, [key, item.id, item.previewUrl, original, source]);
  if (!source) return null;
  const src = original || item.previewUrl ? source : thumbnail?.key === key ? thumbnail.src : undefined;
  return <img ref={ref} className="mediaImage" src={src} style={src ? undefined : { opacity: 0 }} alt="" loading={original ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => { if (src !== source) setThumbnail({ key, src: source }); }} />;
}

export function getMediaSource(item: MediaItem): string | null {
  return resolveMediaSource(item, isTauriRuntime() ? convertFileSrc : undefined);
}
