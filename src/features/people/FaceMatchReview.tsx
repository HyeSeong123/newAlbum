import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { FaceIndex, FaceMatch, findFaceMatches, moveFaces } from './faceService';

export function FaceMatchReview({ index, onClose, onSaved }: { index: FaceIndex; onClose: () => void; onSaved: () => Promise<void> }) {
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  useModalBehavior(() => { if (!saving) onClose(); });
  useEffect(() => {
    let alive = true;
    findFaceMatches().then((result) => { if (alive) setMatches(result); })
      .catch(() => { if (alive) setError('얼굴을 다시 비교하지 못했습니다. 앱을 다시 실행해 주세요.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function apply() {
    if (saving || !selected.length) return;
    setSaving(true); setError('');
    try {
      const groups = new Map<number, number[]>();
      matches.filter((match) => selected.includes(match.face_id)).forEach((match) => {
        groups.set(match.person_id, [...(groups.get(match.person_id) ?? []), match.face_id]);
      });
      for (const [target, ids] of groups) await moveFaces(ids, target);
      await onSaved();
      onClose();
    } catch {
      setError('일부 변경을 저장하지 못했습니다. 닫은 뒤 다시 비교해 주세요.');
      setSelected([]);
      setMatches([]);
      await onSaved().catch(() => undefined);
    } finally { setSaving(false); }
  }
  const pageCount = Math.max(1, Math.ceil(matches.length / 24));
  return <div className="modalBackdrop">
    <section className="faceMatchReview" role="dialog" aria-modal="true" aria-labelledby="faceMatchTitle">
      <header className="detailHeader"><strong id="faceMatchTitle">이름 있는 인물과 다시 비교</strong><button className="closeButton" title="닫기" disabled={saving} onClick={onClose}><X size={18} /></button></header>
      <div className="faceMatchBody">
        {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />얼굴 비교 중</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && <p role="status">{matches.length ? `확인할 얼굴 ${matches.length}개` : '새로 제안할 얼굴이 없습니다.'}</p>}
        <div className="faceMatchGrid">{matches.slice(page * 24, (page + 1) * 24).map((match) => {
          const face = index.faces.find((entry) => entry.id === match.face_id);
          const person = index.people.find((entry) => entry.id === match.person_id);
          return <label key={match.face_id} className="faceMatchItem">
            <img src={face?.thumbnail} alt="비교할 얼굴" />
            <span><input type="checkbox" disabled={saving} checked={selected.includes(match.face_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, match.face_id] : current.filter((id) => id !== match.face_id))} />{person?.name} 추정</span>
          </label>;
        })}</div>
      </div>
      <footer className="peopleActions faceMatchFooter">
        {pageCount > 1 && <><button title="이전 페이지" disabled={saving || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {pageCount}</span><button title="다음 페이지" disabled={saving || page === pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></>}
        <button disabled={saving || !selected.length} onClick={() => void apply()}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}선택한 얼굴 적용{selected.length ? ` (${selected.length})` : ''}</button>
      </footer>
    </section>
  </div>;
}
