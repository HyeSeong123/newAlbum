import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Image } from "lucide-react";
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

export function EmptyState({ text, title, description, actionLabel, onAction, actionIcon, icon }: {
  text?: string; title?: string; description?: string; actionLabel?: string; onAction?: () => void; actionIcon?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="emptyState">
      {icon ?? <Image size={30} aria-hidden="true" />}
      {title ? <h3>{title}</h3> : null}
      {description ? <p>{description}</p> : text ? <p>{text}</p> : null}
      {actionLabel && onAction && <button className="emptyStateAction" onClick={onAction}>{actionIcon}{actionLabel}</button>}
    </div>
  );
}

export function MediaVisual({ item, className, children, original = false, fit = "contain" }: { item: MediaItem; className?: string; children?: ReactNode; original?: boolean; fit?: "contain" | "cover" }) {
  return (
    <div className={`mediaVisual fit-${fit}${className ? ` ${className}` : ""}`} style={{ background: fit === "contain" ? "#eeede7" : item.thumbnail }}>
      <MediaImage item={item} original={original} />
      {children}
      <FavoriteBadge item={item} />
    </div>
  );
}

export function FavoriteBadge({ item }: { item: Pick<MediaItem, 'favorite'> }) {
  return item.favorite ? <span className="favoritePhotoBadge" role="img" aria-label="즐겨찾기 사진"><Heart size={18} fill="currentColor" aria-hidden="true" style={{ color: '#d83e52' }} /></span> : null;
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

export function getMediaSource(item: Pick<MediaItem, "filePath" | "previewUrl">): string | null {
  return resolveMediaSource(item, isTauriRuntime() ? convertFileSrc : undefined);
}
