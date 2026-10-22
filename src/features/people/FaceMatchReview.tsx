import { FunctionHelp } from '../../components/FunctionHelp';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Users } from 'lucide-react';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { useRowSelection } from '../../hooks/useRowSelection';
import { FaceIndex, FaceMatch, findFaceMatches, moveFaces } from './faceService';
import { indexFaces } from './peopleModel';

export function FaceMatchReview({ index, onClose, onSaved, onRegister }: { index: FaceIndex; onClose: () => void; onSaved: () => Promise<void>; onRegister: (ids: number[]) => void }) {
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const faces = useMemo(() => indexFaces(index).unconfirmed, [index]);
  const eligible = useMemo(() => new Set(faces.map(face => face.id)), [faces]);
  const proposals = matches.filter(match => eligible.has(match.face_id));
  const selectedProposals = proposals.filter(match => selected.includes(match.face_id));
  const toggle = (id: string) => setSelected(current => current.includes(Number(id)) ? current.filter(value => value !== Number(id)) : [...current, Number(id)]);
  const selection = useRowSelection(!saving && !loading, toggle, id => selected.includes(Number(id)));
  useEffect(() => {
    let alive = true;
    findFaceMatches().then((result) => { if (alive) setMatches(result); })
      .catch(() => { if (alive) setError('얼굴을 다시 비교하지 못했습니다. 앱을 다시 실행해 주세요.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function apply() {
    if (saving || !selectedProposals.length) return;
    setSaving(true); setError('');
    try {
      const groups = new Map<number, number[]>();
      selectedProposals.forEach((match) => {
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
  const pageCount = Math.max(1, Math.ceil(faces.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const pageFaces = faces.slice(currentPage * 24, (currentPage + 1) * 24);
  function togglePage() {
    const ids = new Set(pageFaces.map(face => face.id));
    setSelected(current => pageFaces.every(face => current.includes(face.id))
      ? current.filter(id => !ids.has(id)) : [...new Set([...current, ...ids])]);
  }
  return <EntityEditorDialog title="미확인 인물 다시 확인" className="faceMatchReview" busy={saving} onClose={onClose}>
      <div className="faceMatchBody">
        {loading && <p role="status"><LoaderCircle className="spinIcon" size={18} />얼굴 비교 중</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && <p role="status">미확인 얼굴 {faces.length}개 · 이름 추천 {proposals.length}개</p>}
        <FunctionHelp title="미확인 인물 다시 확인"><p>이름이 없고 아직 확인하지 않은 얼굴만 다시 비교해요. 이미 확인한 인물과 사진 연결은 유지됩니다.</p>
        <p>얼굴을 선택해 추천 이름을 확인하거나 이름 지정하세요. 저장하기 전에는 이름을 바꾸지 않아요.</p></FunctionHelp>
        <div className="faceMatchGrid" {...selection}>{pageFaces.map((face) => {
          const match = proposals.find(entry => entry.face_id === face.id);
          const person = index.people.find((entry) => entry.id === match?.person_id);
          return <div key={face.id} className="faceMatchItem">
            <label data-selection-id={face.id}>
              <img src={face.thumbnail} alt="비교할 얼굴" draggable={false} />
              <span><input type="checkbox" aria-label={`미확인 얼굴 ${face.id} 선택`} disabled={saving || loading} checked={selected.includes(face.id)} onChange={() => toggle(String(face.id))} />{person ? `${person.name}일까요?` : '이름 추천 없음'}</span>
            </label>
            {match?.candidates && match.candidates.length > 1 && <select aria-label="인물 후보" disabled={saving} value={match.person_id} onChange={(event) => setMatches((current) => current.map((entry) => entry.face_id === match.face_id ? {...entry, person_id:Number(event.target.value)} : entry))}>
              {match.candidates.map((candidate) => <option key={candidate.person_id} value={candidate.person_id}>{index.people.find((entry)=>entry.id===candidate.person_id)?.name}</option>)}
            </select>}
          </div>;
        })}</div>
      </div>
      <footer className="peopleActions faceMatchFooter">
        <span>{selected.length}개 선택</span>
        <button disabled={saving || loading || !faces.length} onClick={togglePage}>현재 페이지 선택/해제</button>
        {pageCount > 1 && <><button title="이전 페이지" disabled={saving || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage + 1} / {pageCount}</span><button title="다음 페이지" disabled={saving || currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></>}
        <button disabled={saving || loading || !selected.length} onClick={() => onRegister(selected)}><Users size={18} />이름 지정</button>
        <button disabled={saving || !selectedProposals.length} onClick={() => void apply()}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}이 이름으로 저장{selectedProposals.length ? ` (${selectedProposals.length})` : ''}</button>
      </footer>
  </EntityEditorDialog>;
}
