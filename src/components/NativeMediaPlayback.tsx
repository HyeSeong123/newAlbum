import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem } from "../types/media";
import { isAndroidRuntime } from "../services/tauriMediaService";
import { getMediaSource } from "./MediaVisual";
import { MediaPlayback } from "./MediaPlayback";

export function NativeMediaPlayback({ item }: { item: MediaItem }) {
  const native = isAndroidRuntime() && !item.previewUrl;
  const [stream, setStream] = useState<{ loading: boolean; source: string | null }>({ loading: native, source: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!native) return;
    let alive = true;
    setStream({ loading: true, source: null });
    void invoke<string>("media_playback_source", { id: Number(item.id) }).then(source => {
      if (!/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+\/\d+$/.test(source)) throw new Error("Invalid media stream");
      if (alive) setStream({ loading: false, source });
    }).catch(() => { if (alive) setStream({ loading: false, source: null }); });
    return () => { alive = false; };
  }, [native, item.id, item.filePath, attempt]);
  if (item.fileType === "image") return null;
  if (native && stream.loading) return <div className="mediaPlaybackError" role="status"><p>{item.fileType === "video" ? "영상을" : "음원을"} 불러오는 중…</p></div>;
  return <MediaPlayback kind={item.fileType} fileName={item.fileName}
    source={native ? stream.source : getMediaSource(item)} onRetry={native ? () => setAttempt(value => value + 1) : undefined} />;
}
