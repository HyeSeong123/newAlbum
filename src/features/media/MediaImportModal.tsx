import { useState, type FormEvent } from "react";
import { FolderOpen, Images, LoaderCircle, Plus, X } from "lucide-react";
import { AlbumColorPicker, DEFAULT_ALBUM_COLOR } from "../albums/AlbumCover";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import type { MediaImportOptions } from "./useMediaLibrary";
import "./media-import.css";

export function MediaImportModal({ onClose, onImport }: { onClose: () => void; onImport: (options: MediaImportOptions) => Promise<void> }) {
  const [kind, setKind] = useState<"files" | "folder">("files");
  const [makeAlbum, setMakeAlbum] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(DEFAULT_ALBUM_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useModalBehavior(() => { if (!busy) onClose(); });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (makeAlbum && !title.trim())) return;
    setBusy(true); setError("");
    try {
      await onImport({ kind, album: makeAlbum ? { title: title.trim(), color } : undefined });
      onClose();
    } catch { setError("가져오기를 시작하지 못했습니다. 다시 선택해 주세요."); setBusy(false); }
  }

  return <div className="modalBackdrop">
    <section className="mediaImportDialog" role="dialog" aria-modal="true" aria-labelledby="mediaImportTitle">
      <header className="mediaImportHeader"><div><h2 id="mediaImportTitle">사진·영상 가져오기</h2><p>간직하고 싶은 순간을 기록에 담아보세요.</p></div><button type="button" className="closeButton" aria-label="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={busy} className="mediaImportFields">
          <fieldset className="mediaImportMethods"><legend>가져오기 방식</legend>
            {([{ value: "files", label: "사진·영상 가져오기", description: "원하는 파일을 골라 담아요", Icon: Images }, { value: "folder", label: "폴더 가져오기", description: "폴더 안의 기록을 함께 담아요", Icon: FolderOpen }] as const).map(method => <label key={method.value} className={kind === method.value ? "selected" : ""}>
              <input autoFocus={method.value === "files"} type="radio" name="importMethod" value={method.value} checked={kind === method.value} onChange={() => setKind(method.value)} /><method.Icon size={21} aria-hidden="true" /><span><strong>{method.label}</strong><small>{method.description}</small></span>
            </label>)}
          </fieldset>
          <label className="mediaImportAlbumToggle"><input type="checkbox" checked={makeAlbum} onChange={event => setMakeAlbum(event.target.checked)} /><span><strong>가져오면서 앨범 만들기</strong><small>새로 가져온 사진과 영상을 한 권에 담아요.</small></span></label>
          {makeAlbum && <div className="mediaImportAlbumFields"><label className="albumTitleField">앨범 제목<input required maxLength={80} value={title} placeholder="예: 우리가 함께한 봄" onChange={event => setTitle(event.target.value)} /></label><AlbumColorPicker value={color} onChange={setColor} items={[]} title={title.trim() || "나의 추억"} /></div>}
          {error && <p role="alert">{error}</p>}
          <footer className="mediaImportActions"><button type="button" onClick={onClose}>취소</button><button className="primary" type="submit" disabled={makeAlbum && !title.trim()}>{busy ? <LoaderCircle className="spinIcon" size={17} /> : <Plus size={17} />}{busy ? "가져오는 중" : kind === "folder" ? "폴더 선택" : "파일 선택"}</button></footer>
        </fieldset>
      </form>
    </section>
  </div>;
}
