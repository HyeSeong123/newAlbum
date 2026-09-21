import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, FolderOpen, FolderOutput, X } from "lucide-react";
import type { MediaItem } from "../types/media";
import { chooseExportDestination, exportMediaGroup, isTauriRuntime, type MediaExportResult } from "../services/tauriMediaService";
import { useModalBehavior } from "../hooks/useModalBehavior";

export function exportFolderName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  return cleaned || "내보낸 사진";
}

export function ExportModal({ title, items, onClose }: { title: string; items: MediaItem[]; onClose: () => void }) {
  const [folderName, setFolderName] = useState(() => exportFolderName(title));
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MediaExportResult | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useModalBehavior(() => { if (!busy) onClose(); });
  useEffect(() => { nameInput.current?.focus(); }, []);

  async function chooseDestination() {
    setError("");
    try {
      const selected = await chooseExportDestination();
      if (selected) setDestination(selected);
    } catch {
      setError("내보낼 위치를 선택하지 못했습니다.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!folderName.trim() || !destination.trim() || !items.length) return;
    setBusy(true); setError("");
    try {
      setResult(await exportMediaGroup(items, destination.trim(), folderName.trim()));
    } catch (reason) {
      setError(typeof reason === "string" && reason.trim() ? reason : "파일을 내보내지 못했습니다. 경로와 폴더명을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="exportModal" role="dialog" aria-modal="true" aria-labelledby="exportModalTitle">
      <header className="detailHeader"><strong id="exportModalTitle">내보내기</strong><button type="button" className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {result ? <div className="exportComplete">
        <span className="exportCompleteIcon"><Check size={24} /></span>
        <h3>{result.copied}개 파일을 내보냈습니다</h3>
        <p>{result.directory}</p>
        <button type="button" className="primary" onClick={onClose}>닫기</button>
      </div> : <form onSubmit={(event) => void submit(event)}>
        <p className="exportSummary"><FolderOutput size={19} />{items.length}개 파일을 새 폴더에 복사합니다. 원본 파일은 그대로 유지됩니다.</p>
        <div className="exportField"><label htmlFor="export-folder-name">폴더명</label><input id="export-folder-name" ref={nameInput} required maxLength={100} value={folderName} disabled={busy} onChange={(event) => setFolderName(event.target.value)} /></div>
        <div className="exportField"><label htmlFor="export-destination">내보낼 경로</label><div className="exportPathField"><input id="export-destination" required value={destination} disabled={busy} placeholder="저장할 상위 폴더를 선택하세요" onChange={(event) => setDestination(event.target.value)} /><button type="button" disabled={busy || !isTauriRuntime()} onClick={() => void chooseDestination()}><FolderOpen size={18} />경로 선택</button></div></div>
        {!isTauriRuntime() && <p className="exportHint">경로 선택과 파일 복사는 데스크톱 앱에서 사용할 수 있습니다.</p>}
        {error && <p className="exportError" role="alert">{error}</p>}
        <footer className="exportActions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="primary" disabled={busy || !folderName.trim() || !destination.trim() || !items.length}><FolderOutput size={18} />{busy ? "내보내는 중" : "내보내기"}</button></footer>
      </form>}
    </section>
  </div>;
}
