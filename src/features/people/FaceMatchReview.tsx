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
      <header className="detailHeader"><strong id="faceMatchTitle">이름 추천 확인</strong><button className="closeButton" title="닫기" disabled={saving} onClick={onClose}><X size={18} /></button></header>
      <div className="faceMatchBody">
        {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />얼굴 비교 중</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && <p role="status">{matches.length ? `확인할 얼굴 ${matches.length}개` : '닮은 사진을 찾지 못했어요. 이름 없는 사람의 사진을 열어 이름을 직접 붙여 주세요.'}</p>}
        <p>사진과 이름이 맞는지 확인한 뒤 선택해 주세요. 선택하기 전에는 이름을 바꾸지 않아요.</p>
        <p>목록에 없는 사람은 이름 없는 사람에서 이름을 붙이거나 등록한 사람에게 옮겨 주세요.</p>
        <div className="faceMatchGrid">{matches.slice(page * 24, (page + 1) * 24).map((match) => {
          const face = index.faces.find((entry) => entry.id === match.face_id);
          const person = index.people.find((entry) => entry.id === match.person_id);
          return <label key={match.face_id} className="faceMatchItem">
            <img src={face?.thumbnail} alt="비교할 얼굴" />
            <span><input type="checkbox" disabled={saving} checked={selected.includes(match.face_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, match.face_id] : current.filter((id) => id !== match.face_id))} />{person?.name}일까요?</span>
            {match.candidates && match.candidates.length > 1 && <select aria-label="인물 후보" disabled={saving} value={match.person_id} onChange={(event) => setMatches((current) => current.map((entry) => entry.face_id === match.face_id ? {...entry, person_id:Number(event.target.value)} : entry))}>
              {match.candidates.map((candidate) => <option key={candidate.person_id} value={candidate.person_id}>{index.people.find((entry)=>entry.id===candidate.person_id)?.name}</option>)}
            </select>}
          </label>;
        })}</div>
      </div>
      <footer className="peopleActions faceMatchFooter">
        {pageCount > 1 && <><button title="이전 페이지" disabled={saving || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {pageCount}</span><button title="다음 페이지" disabled={saving || page === pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></>}
        <button disabled={saving || !selected.length} onClick={() => void apply()}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}이 이름으로 저장{selected.length ? ` (${selected.length})` : ''}</button>
      </footer>
    </section>
  </div>;
}
