import { useRef, useState, type FormEvent } from "react";
import { Check, Trash2, X } from "lucide-react";
import type { AlbumContent, SavedAlbum } from "../../../types/media";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
import { albumContents, writtenPage } from "../albumContent";
import { AlbumContentEditor } from "./AlbumContentEditor";

export type WrittenRequest = { kind: "CHAPTER" | "TEXT"; afterId?: string; entryId?: string };

export function AlbumWrittenEditor({ album, request, onClose, onSave }: {
  album: SavedAlbum;
  request: WrittenRequest;
  onClose: () => void;
  onSave: (album: SavedAlbum) => Promise<void>;
}) {
  const [entryId] = useState(() => request.entryId ?? crypto.randomUUID());
  const [contents, setContents] = useState(() => {
    const entries = albumContents(album);
    if (!request.entryId) {
      const after = entries.findIndex(entry => entry.id === request.afterId);
      entries.splice(after < 0 ? entries.length : after + 1, 0, { ...writtenPage(request.kind), id: entryId });
    }
    return entries;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const name = request.kind === "CHAPTER" ? "챕터" : "편지";
  useModalBehavior(() => { if (!saving.current) onClose(); });

  async function save(entries: AlbumContent[]) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    const media = new Map(album.items.map(item => [item.id, item]));
    try {
      await onSave({ ...album, contents: entries, items: entries.flatMap(entry => entry.mediaId && media.has(entry.mediaId) ? [media.get(entry.mediaId)!] : []) });
      onClose();
    } catch { setError(`${name}를 저장하지 못했습니다. 작성한 내용은 그대로 남아 있어요. 다시 저장해 주세요.`); }
    finally { saving.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const entry = contents.find(item => item.id === entryId);
    if (!entry || (!entry.title.trim() && (entry.kind === "CHAPTER" || !entry.body.trim()))) {
      setError(request.kind === "CHAPTER" ? "챕터 제목을 입력해 주세요." : "편지 제목이나 내용을 입력해 주세요."); return;
    }
    void save(contents);
  }
  return <div className="modalBackdrop">
    <section className="albumEditor albumWrittenEditor" role="dialog" aria-modal="true" aria-labelledby="albumWrittenEditorTitle">
      <div className="detailHeader albumEditorHeader"><div><strong id="albumWrittenEditorTitle">{name} 상세</strong><small>{album.title}</small></div><button className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={submit}><fieldset disabled={busy}>
        <AlbumContentEditor contents={contents} items={album.items} onChange={setContents} selectedId={entryId} />
        {error && <p className="albumEditorError" role="alert">{error}</p>}
        <div className="albumActions albumEditorFooter">
          {request.entryId && <button type="button" className="albumEntryDelete" onClick={() => void save(contents.filter(entry => entry.id !== entryId))}><Trash2 size={17} />삭제</button>}
          <span>저장하면 앨범에 반영됩니다.</span><button type="button" onClick={onClose}>취소</button><button type="submit"><Check size={18} />{busy ? "저장 중" : "저장"}</button>
        </div>
      </fieldset></form>
    </section>
  </div>;
}
