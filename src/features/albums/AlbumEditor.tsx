import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { AlbumContent, SavedAlbum } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { AlbumColorPicker } from "./AlbumCover";
import { albumContents, writtenPage } from "./albumContent";
import { AlbumContentEditor } from "./chapter/AlbumContentEditor";

export type AlbumEditorSection = "contents" | "chapters" | "letters" | "details" | "photos";

export function AlbumEditor({ album, onClose, onSave, initialSection = "contents", initialAddition }: { album: SavedAlbum; onClose: () => void; onSave: (album: SavedAlbum) => Promise<void>; initialSection?: AlbumEditorSection; initialAddition?: { kind: "CHAPTER" | "TEXT"; afterId?: string } }) {
  const [addition] = useState(() => initialAddition ? writtenPage(initialAddition.kind) : null);
  const [draft, setDraft] = useState(() => {
    const contents = albumContents(album);
    if (addition) {
      const anchor = contents.findIndex(entry => entry.id === initialAddition?.afterId);
      contents.splice(anchor >= 0 ? anchor + 1 : contents.length, 0, addition);
    }
    return { ...album, contents };
  });
  const [section, setSection] = useState<AlbumEditorSection>(initialSection === "contents" ? (initialAddition?.kind === "TEXT" || (!initialAddition && draft.contents.find(entry => !entry.mediaId)?.kind === "TEXT") ? "letters" : "chapters") : initialSection);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(() => addition?.id ?? albumContents(album).find(entry => !entry.mediaId)?.id ?? albumContents(album)[0]?.id ?? null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!addition) return;
    const frame = requestAnimationFrame(() => document.getElementById(`page-title-${addition.id}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [addition]);
  const pageCount = Math.max(1, Math.ceil(draft.items.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  useModalBehavior(() => { if (!busy) onClose(); });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !draft.title.trim()) return;
    const invalid = draft.contents.find(entry => !entry.mediaId && !entry.title.trim() && (entry.kind === "CHAPTER" || !entry.body.trim()));
    if (invalid) {
      setSection(invalid.kind === "CHAPTER" ? "chapters" : "letters"); setSelectedContentId(invalid.id);
      setError("챕터에는 제목을, 감상문에는 제목이나 내용을 입력해 주세요."); return;
    }
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
  function changeContents(contents: AlbumContent[]) {
    setDraft(current => {
      const byId = new Map(current.items.map(item => [item.id, item]));
      return { ...current, contents, items: contents.flatMap(entry => entry.mediaId && byId.has(entry.mediaId) ? [byId.get(entry.mediaId)!] : []) };
    });
  }
  return <div className="modalBackdrop">
    <section className="albumEditor" role="dialog" aria-modal="true" aria-labelledby="albumEditorTitle">
      <div className="detailHeader albumEditorHeader"><div><strong id="albumEditorTitle">앨범 수정</strong><small>{album.title}</small></div><button className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <nav className="albumEditorTabs" aria-label="앨범 편집 메뉴">
            {([
              ["chapters", "챕터"],
              ["letters", "감상문"],
              ["details", "앨범 정보"],
              ["photos", `사진 관리 · ${draft.items.length}`],
            ] as const).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? "page" : undefined} onClick={() => { setSection(key); setError("");
              if (key === "chapters" || key === "letters") setSelectedContentId(draft.contents.find(entry => entry.kind === (key === "chapters" ? "CHAPTER" : "TEXT"))?.id ?? null); }}>{label}</button>)}
          </nav>
          {(section === "chapters" || section === "letters") && <AlbumContentEditor contents={draft.contents} items={draft.items} onChange={changeContents} selectedId={selectedContentId} onSelect={(id, kind) => { setSelectedContentId(id); const selectedKind = kind ?? draft.contents.find(entry => entry.id === id)?.kind; if (selectedKind === "CHAPTER") setSection("chapters"); else if (selectedKind === "TEXT") setSection("letters"); }} />}
          {section === "details" && <section className="albumEditorSimple"><h3>앨범 정보</h3><p>앨범 이름과 표지 색상을 바꿀 수 있습니다.</p><label className="albumTitleField">제목<input required maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <AlbumColorPicker value={draft.coverColor} onChange={(coverColor) => setDraft({ ...draft, coverColor })} items={draft.items} title={draft.title} /></section>}
          {section === "photos" && <section className="albumEditorSimple"><h3>사진 관리</h3><p>앨범에서 제외할 사진을 선택하세요. 원본 사진은 유지됩니다.</p>
          <div className="albumActions"><strong>사진 {draft.items.length}장</strong><button type="button" disabled={!chosen.length} onClick={removeChosen}><Trash2 size={17} />앨범에서 삭제{chosen.length > 0 ? ` (${chosen.length})` : ""}</button></div>
          <div className="albumEditPhotos">{draft.items.slice(currentPage * 24, (currentPage + 1) * 24).map((item) => <button type="button" key={item.id} aria-label={`${item.takenAt ?? "날짜 없음"} 사진 선택`} aria-pressed={chosen.includes(item.id)} onClick={() => setChosen((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
            <MediaVisual item={item} /><span className={`albumSelectionMark ${chosen.includes(item.id) ? "checked" : ""}`}>{chosen.includes(item.id) && <Check size={22} strokeWidth={3} />}</span>
          </button>)}</div>
          {!draft.items.length && <p>앨범에 사진이 없습니다.</p>}
          {pageCount > 1 && <div className="albumActions"><button type="button" title="이전 페이지" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pageCount}</span><button type="button" title="다음 페이지" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
          </section>}
          {error && <p className="albumEditorError" role="alert">{error}</p>}
          <div className="albumActions albumEditorFooter"><span>변경 내용은 저장을 누르면 반영됩니다.</span><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={!draft.title.trim()}><Check size={18} />{busy ? "저장 중" : "저장"}</button></div>
        </fieldset>
      </form>
    </section>
  </div>;
}
