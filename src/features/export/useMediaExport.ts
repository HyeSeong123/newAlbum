import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../../types/media";
import { chooseExportDestination, exportMediaGroup, type MediaExportResult } from "../../services/tauriMediaService";
import { exportFolderName } from "./exportModel";

export function useMediaExport(title: string, items: MediaItem[]) {
  const [folderName, setFolderName] = useState(() => exportFolderName(title));
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MediaExportResult | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function chooseDestination() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const selected = await chooseExportDestination();
      if (mounted.current && selected) setDestination(selected);
    } catch {
      if (mounted.current) setError("내보낼 위치를 선택하지 못했습니다.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submit() {
    if (locked.current || result || !folderName.trim() || !destination.trim() || !items.length) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const exported = await exportMediaGroup(items, destination.trim(), folderName.trim());
      if (mounted.current) setResult(exported);
    } catch (reason) {
      if (mounted.current) setError(typeof reason === "string" && reason.trim() ? reason : "파일을 내보내지 못했습니다. 경로와 폴더명을 확인해 주세요.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return { folderName, setFolderName, destination, setDestination, busy, error, result, chooseDestination, submit };
}
