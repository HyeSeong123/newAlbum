import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { AlbumColorPicker, DEFAULT_ALBUM_COLOR } from "./AlbumCover";

export function AlbumCreateModal({ items, onClose, onCreate }: { items: MediaItem[]; onClose: () => void; onCreate: (title: string, color: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(DEFAULT_ALBUM_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useModalBehavior(() => { if (!busy) onClose(); });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true); setError("");
    try { await onCreate(title.trim(), color); onClose(); }
    catch { setError("앨범을 만들지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="modalBackdrop">
    <section className="albumCreateModal" role="dialog" aria-modal="true" aria-labelledby="albumCreateTitle">
      <div className="detailHeader"><strong id="albumCreateTitle">앨범 만들기</strong><button title="닫기" className="closeButton" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <label className="albumTitleField">제목<input autoFocus required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <AlbumColorPicker value={color} onChange={setColor} items={items} title={title || "나의 추억"} />
          {error && <p role="alert">{error}</p>}
          <div className="albumActions"><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={!title.trim() || !items.length}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? "만드는 중" : "만들기"}</button></div>
        </fieldset>
      </form>
    </section>
  </div>;
}
