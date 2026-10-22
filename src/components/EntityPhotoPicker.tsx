import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { EntityEditorDialog } from './EntityEditorDialog';
import { MediaVisual } from './MediaVisual';
import { useRowSelection } from '../hooks/useRowSelection';
import './entity-photo-picker.css';

/** Manual photo membership never depends on a successful AI detection. */
export function EntityPhotoPicker({ title, photos, name, initialIds = [], automaticIds = [], onClose, onSave }: {
  title: string; photos: MediaItem[]; name?: string; initialIds?: number[]; automaticIds?: number[];
  onClose: () => void; onSave: (name: string, ids: number[]) => Promise<void>;
}) {
  const [draftName, setName] = useState(name ?? '');
  const available = useMemo(() => new Set(photos.map(photo => Number(photo.id))), [photos]);
  const [selected, setSelected] = useState(() => new Set(initialIds));
  const automatic = useMemo(() => new Set(automaticIds.filter(id => available.has(id))), [automaticIds, available]);
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const checked = (id: string) => selected.has(Number(id)) || automatic.has(Number(id));
  const toggle = (id: string) => {
    if (lock.current || automatic.has(Number(id))) return;
    setSelected(current => { const next = new Set(current); if (next.has(Number(id))) next.delete(Number(id)); else next.add(Number(id)); return next; });
  };
  const drag = useRowSelection(!busy, toggle, checked);
  const pages = Math.max(1, Math.ceil(photos.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const count = new Set([...selected, ...automatic]).size;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !draftName.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSave(draftName.trim(), [...selected]); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : typeof reason === 'string' && reason.trim() ? reason : '사진을 저장하지 못했습니다. 선택한 사진은 남아 있습니다. 다시 저장해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <EntityEditorDialog title={title} busy={busy} onClose={onClose} className="entityPhotoPicker">
    <form onSubmit={event => void submit(event)}>
      <div className="entityEditBody">
        {name === undefined ? <label className="entityEditField">이름<input aria-label="등록할 이름" value={draftName} maxLength={80} required disabled={busy} placeholder="이름을 입력하세요" onChange={event => setName(event.target.value)} /></label> : <strong>{name}의 사진</strong>}
        <p>자동으로 감지하지 못한 사진도 직접 등록할 수 있어요. 사진을 눌러 연결하거나 해제하세요.</p>
        {!!automatic.size && <p>얼굴로 연결된 사진은 표시만 합니다. 연결을 바꾸려면 인물 화면의 얼굴 선택 또는 사진 선택를 사용하세요.</p>}
        <div className="peopleActions"><button type="button" disabled={busy} onClick={() => setSelected(new Set(photos.filter(photo=>!automatic.has(Number(photo.id))).map(photo=>Number(photo.id))))}>전체 선택</button><button type="button" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>선택 해제</button></div>
        <div className="entityPhotoCount" role="status">사진 {count}장 선택</div>
        <div className="entityPhotoGrid" {...drag}>{photos.slice(currentPage * 24, (currentPage + 1) * 24).map(photo => <button type="button" key={photo.id} data-selection-id={photo.id} className="entityPhotoChoice" aria-label={`사진 선택 ${photo.fileName}`} aria-pressed={checked(photo.id)} disabled={busy || automatic.has(Number(photo.id))} onClick={() => toggle(photo.id)}>
          <MediaVisual item={photo} /><span className={`faceCheck ${checked(photo.id) ? 'checked' : ''}`} aria-hidden="true">{checked(photo.id) && <Check size={22} />}</span>
          <span>{photo.takenAt ?? photo.fileName}</span>{automatic.has(Number(photo.id)) && <small>얼굴로 연결됨</small>}
        </button>)}</div>
        {!photos.length && <p>먼저 사진 가져오기에서 사진을 등록해 주세요.</p>}
        {pages > 1 && <div className="peopleActions"><button type="button" aria-label="이전 사진" disabled={busy || !currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pages}</span><button type="button" aria-label="다음 사진" disabled={busy || currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>}
        {error && <p role="alert" className="entityEditError">{error}</p>}
      </div>
      <footer className="peopleActions entityEditFooter"><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="primaryControl" disabled={busy || !draftName.trim()}>{busy ? <LoaderCircle size={18} className="spinIcon" /> : <Check size={18} />}사진 저장</button></footer>
    </form>
  </EntityEditorDialog>;
}
