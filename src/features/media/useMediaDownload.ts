import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../../types/media";
import { downloadMedia, isTauriRuntime } from "../../services/tauriMediaService";

export function useMediaDownload(item: MediaItem) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ id: "", error: "", notice: "" });
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function download() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback({ id: item.id, error: "", notice: "" });
    try {
      const saved = await downloadMedia(item);
      if (mounted.current && saved) setFeedback({ id: item.id, error: "", notice: item.previewUrl ? "다운로드를 시작했습니다." : "원본 사진을 저장했습니다." });
    } catch (reason) {
      if (mounted.current) setFeedback({ id: item.id, notice: "", error: typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "사진을 다운로드하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return {
    download, busy,
    available: Boolean(item.previewUrl || (isTauriRuntime() && /^\d+$/.test(item.id) && item.filePath)),
    error: feedback.id === item.id ? feedback.error : "",
    notice: feedback.id === item.id ? feedback.notice : "",
  };
}
