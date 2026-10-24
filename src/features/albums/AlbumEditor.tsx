import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { SavedAlbum } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { AlbumColorPicker, DEFAULT_ALBUM_COLOR } from "./AlbumCover";
import { albumContents } from "./albumContent";

export type AlbumEditorSection = "details" | "photos";

export function AlbumEditor({ album, onClose, onSave, initialSection = "details" }: { album: SavedAlbum; onClose: () => void; onSave: (album: SavedAlbum) => Promise<void>; initialSection?: AlbumEditorSection }) {
  const panel = useRef<HTMLElement>(null);
  const onKeyDown = useDialogFocus(panel);
  const [draft, setDraft] = useState(() => ({ ...album, coverColor: album.coverColor || DEFAULT_ALBUM_COLOR, contents: albumContents(album) }));
  const original = useRef(JSON.stringify(draft));
  const [section, setSection] = useState<AlbumEditorSection>(initialSection);
  const [chosen, setChosen] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const togglePhoto = (id: string) => setChosen(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const drag = useRowSelection(!busy && section === "photos", togglePhoto, id => chosen.includes(id));
  const pageCount = Math.max(1, Math.ceil(draft.items.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  function close() {
    if (saving.current) return;
    if (JSON.stringify(draft) !== original.current && !window.confirm("저장하지 않은 내용이 있어요. 수정을 닫을까요?")) return;
    onClose();
  }
  useModalBehavior(close);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !draft.title.trim()) return;
    saving.current = true;
    setBusy(true); setError("");
    try { await onSave({ ...draft, title: draft.title.trim() }); onClose(); }
    catch { setError("앨범을 저장하지 못했습니다. 입력한 내용은 화면에 그대로 남아 있습니다. 다시 저장해 주세요."); }
    finally { saving.current = false; setBusy(false); }
  }
  function removeChosen() {
    const removed = new Set(chosen);
    setDraft((current) => ({ ...current, items: current.items.filter((item) => !removed.has(item.id)), contents: current.contents.filter(entry => !entry.mediaId || !removed.has(entry.mediaId)) }));
    setChosen([]);
  }
  return <div className="modalBackdrop">
    <section ref={panel} tabIndex={-1} onKeyDown={onKeyDown} className="albumEditor" role="dialog" aria-modal="true" aria-labelledby="albumEditorTitle">
      <div className="detailHeader albumEditorHeader"><div><strong id="albumEditorTitle">앨범 수정</strong><small>{album.title}</small></div><button className="closeButton" title="닫기" disabled={busy} onClick={close}><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <nav className="albumEditorTabs" aria-label="앨범 편집 메뉴">
            {([
              ["details", "앨범 정보"],
              ["photos", `사진 관리 · ${draft.items.length}`],
            ] as const).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? "page" : undefined} onClick={() => { setSection(key); setError(""); }}>{label}</button>)}
          </nav>
          {section === "details" && <section className="albumEditorSimple"><h3>앨범 정보</h3><label className="albumTitleField">제목<input required maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <AlbumColorPicker value={draft.coverColor} onChange={(coverColor) => setDraft({ ...draft, coverColor })} items={draft.items} title={draft.title} /></section>}
          {section === "photos" && <section className="albumEditorSimple"><h3>사진 관리</h3><p>앨범에서 제외할 사진을 선택하세요. 원본 사진은 유지됩니다.</p>
          <div className="albumActions"><strong>사진 {draft.items.length}장</strong><button type="button" className="dangerButton" disabled={!chosen.length} onClick={removeChosen}><Trash2 size={17} />앨범에서 삭제{chosen.length > 0 ? ` (${chosen.length})` : ""}</button></div>
          <div className="albumEditPhotos" {...drag}>{draft.items.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} data-selection-id={item.id} aria-label={`${item.takenAt ?? "날짜 없음"} 사진 선택`} aria-pressed={chosen.includes(item.id)} onClick={() => togglePhoto(item.id)}>
            <MediaVisual item={item} /><span className={`albumSelectionMark ${chosen.includes(item.id) ? "checked" : ""}`}>{chosen.includes(item.id) && <Check size={22} strokeWidth={3} />}</span>
          </button>)}</div>
          {!draft.items.length && <p>앨범에 사진이 없습니다.</p>}
          {pageCount > 1 && <div className="albumActions"><button type="button" title="이전 페이지" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pageCount}</span><button type="button" title="다음 페이지" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
          </section>}
          {error && <p className="albumEditorError" role="alert">{error}</p>}
          <div className="albumActions albumEditorFooter" data-help-dock><span>변경 내용은 저장을 누르면 반영됩니다.</span><button type="button" onClick={close}>취소</button><button type="submit" className="primaryControl" disabled={!draft.title.trim()}><Check size={18} />{busy ? "저장 중" : "저장"}</button></div>
        </fieldset>
      </form>
    </section>
  </div>;
}
