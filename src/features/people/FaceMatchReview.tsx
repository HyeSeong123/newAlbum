import { FunctionHelp } from '../../components/FunctionHelp';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const busy = useRef(false);
  const [savedFaceIds, setSavedFaceIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [closeAfterRefresh, setCloseAfterRefresh] = useState(false);
  const [page, setPage] = useState(0);
  const faces = useMemo(() => indexFaces(index).unconfirmed.filter(face => !savedFaceIds.includes(face.id)), [index, savedFaceIds]);
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
    if (busy.current || !selectedProposals.length) return;
    busy.current = true;
    setSaving(true); setError('');
    let savedCount = 0;
    let saveFailed = false;
    try {
      const groups = new Map<number, number[]>();
      selectedProposals.forEach((match) => {
        groups.set(match.person_id, [...(groups.get(match.person_id) ?? []), match.face_id]);
      });
      try {
        for (const [target, ids] of groups) {
          await moveFaces(ids, target);
          savedCount += ids.length;
          setSavedFaceIds(current => [...current, ...ids]);
          setSelected(current => current.filter(id => !ids.includes(id)));
          setMatches(current => current.filter(match => !ids.includes(match.face_id)));
        }
      } catch {
        saveFailed = true;
        setError(`${savedCount ? `${savedCount}개 얼굴은 저장했어요. ` : ''}남은 얼굴을 저장하지 못했어요. 선택과 추천 이름을 확인하고 다시 저장해 주세요.`);
      }
      // Refresh partial successes too, without discarding the remaining choices.
      if (savedCount) {
        setCloseAfterRefresh(!saveFailed);
        try {
          await onSaved();
          setRefreshError('');
        } catch {
          setRefreshError(saveFailed
            ? '저장한 얼굴의 목록을 불러오지 못했어요. 목록을 다시 불러오거나 남은 얼굴을 저장해 주세요.'
            : '얼굴은 모두 저장했어요. 목록을 불러오지 못했어요. 다시 불러오거나 닫아 주세요.');
          return;
        }
        if (!saveFailed) onClose();
      }
    } finally { busy.current = false; setSaving(false); }
  }
  async function retryRefresh() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await onSaved();
      setRefreshError('');
      if (closeAfterRefresh) onClose();
    } catch {
      // Keep the saved/unsaved distinction and the retry action visible.
    } finally { busy.current = false; setSaving(false); }
  }
  const pageCount = Math.max(1, Math.ceil(faces.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const pageFaces = faces.slice(currentPage * 24, (currentPage + 1) * 24);
  const pageSelected = pageFaces.length > 0 && pageFaces.every(face => selected.includes(face.id));
  function togglePage() {
    const ids = new Set(pageFaces.map(face => face.id));
    setSelected(current => pageFaces.every(face => current.includes(face.id))
      ? current.filter(id => !ids.has(id)) : [...new Set([...current, ...ids])]);
  }
  return <EntityEditorDialog title="미확인 인물 다시 확인" className="faceMatchReview" busy={saving} onClose={onClose}>
      <div className="faceMatchBody">
        <div className="faceMatchSummary">
          {loading ? <p role="status"><LoaderCircle className="spinIcon" size={18} />얼굴 비교 중</p>
            : <p role="status">미확인 얼굴 <strong>{faces.length}개</strong><span>이름 추천 {proposals.length}개</span></p>}
          <FunctionHelp title="미확인 인물 다시 확인"><p>아직 확인하지 않은 얼굴을 등록된 인물과 다시 비교해요. 얼굴을 선택하고 추천 이름이 맞으면 ‘추천 이름으로 저장’을 눌러 주세요.</p>
          <p>추천이 없거나 다른 이름을 붙이고 싶다면 ‘이름 지정’을 눌러 주세요. 저장하기 전까지는 사진 연결이 바뀌지 않아요.</p></FunctionHelp>
        </div>
        {error && <p className="faceMatchError" role="alert">{error}</p>}
        {refreshError && <div className="faceMatchError"><p role="alert">{refreshError}</p><button type="button" disabled={saving} onClick={() => void retryRefresh()}>목록 다시 불러오기</button></div>}
        {!loading && !faces.length && <p className="faceMatchEmpty">다시 확인할 얼굴이 없어요.</p>}
        <div className="faceMatchGrid" {...selection}>{pageFaces.map((face) => {
          const match = proposals.find(entry => entry.face_id === face.id);
          const person = index.people.find((entry) => entry.id === match?.person_id);
          const checked = selected.includes(face.id);
          return <div key={face.id} className={`faceMatchItem${checked ? ' selected' : ''}`}>
            <label data-selection-id={face.id}>
              <span className="faceMatchPortrait"><img src={face.thumbnail} alt="비교할 얼굴" draggable={false} />
                <span className="faceMatchCheck"><input type="checkbox" aria-label={`미확인 얼굴 ${face.id} 선택`} disabled={saving || loading} checked={checked} onChange={() => toggle(String(face.id))} /><Check size={16} aria-hidden="true" /></span>
              </span>
              <span className="faceMatchName">{person ? `${person.name}일까요?` : '이름 추천 없음'}</span>
            </label>
            {match?.candidates && match.candidates.length > 1 && <label className="faceMatchCandidate"><span>추천 이름</span>
              <select aria-label={`미확인 얼굴 ${face.id} 인물 후보`} disabled={saving || loading} value={match.person_id} onChange={(event) => setMatches((current) => current.map((entry) => entry.face_id === match.face_id ? {...entry, person_id:Number(event.target.value)} : entry))}>
                {match.candidates.map((candidate) => <option key={candidate.person_id} value={candidate.person_id}>{index.people.find((entry)=>entry.id===candidate.person_id)?.name}</option>)}
              </select>
            </label>}
          </div>;
        })}</div>
      </div>
      <footer className="faceMatchFooter" data-help-dock>
        <div className="faceMatchSelection"><strong role="status" aria-live="polite">{selected.length}개 선택</strong>
          <button type="button" disabled={saving || loading || !faces.length} aria-pressed={pageSelected} onClick={togglePage}>{pageSelected ? '이 페이지 선택 해제' : '이 페이지 전체 선택'}</button>
        </div>
        {pageCount > 1 && <nav className="faceMatchPages" aria-label="미확인 얼굴 페이지"><button type="button" aria-label="이전 페이지" disabled={saving || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span aria-live="polite">{currentPage + 1} / {pageCount}</span><button type="button" aria-label="다음 페이지" disabled={saving || currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></nav>}
        <div className="faceMatchSaveActions">
          <button type="button" disabled={saving || loading || !selected.length} onClick={() => onRegister(selected)}><Users size={18} />이름 지정</button>
          <button type="button" className="primary" disabled={saving || loading || !selectedProposals.length} onClick={() => void apply()}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}추천 이름으로 저장{selectedProposals.length ? ` (${selectedProposals.length})` : ''}</button>
        </div>
      </footer>
  </EntityEditorDialog>;
}

