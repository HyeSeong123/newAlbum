import { FunctionHelp } from '../../components/FunctionHelp';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import { EntitySelectionBar } from '../entities/EntitySelectionBar';
import { EntityAssignmentDialog } from '../entities/EntityAssignmentDialog';
import { assignPetDetections, type Assignment } from '../entities/entityService';
import { invoke } from '@tauri-apps/api/core';
import type { Pet } from './petService';
import { useRowSelection } from '../../hooks/useRowSelection';
import { Check } from 'lucide-react';

interface UnknownPetItem { id: number; media_id: number; box_: number[] | null }

export function UnknownPets({ photos, pets, onSaved, selecting, onOpen }: {
  selecting: boolean; onOpen: (item: MediaItem, collection?: MediaItem[]) => void;
  photos: MediaItem[]; pets: Pet[]; onSaved: () => Promise<void>;
}) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<UnknownPetItem[]>([]);
  const [page, setPage] = useState(0), [next, setNext] = useState(false);
  const [selection, setSelection] = useState<number[]>([]), [assigning, setAssigning] = useState(false);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false), savingLock = useRef(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const photoById = useMemo(() => new Map(photos.map(photo => [Number(photo.id), photo])), [photos]);

  useEffect(() => {
    if (!selecting) { setSelection([]); setAssigning(false); setTarget(''); }
  }, [selecting]);

  async function read(currentPage: number) {
    const batch = await invoke<UnknownPetItem[]>('list_unknown_pet_items', { page: currentPage });
    return { found: batch.slice(0, 24).filter(row => photoById.has(row.media_id)), more: batch.length > 24 };
  }

  useEffect(() => {
    let alive = true, request = 0;
    const refresh = () => {
      const current = ++request;
      setLoading(true);
      setError('');
      read(page).then(result => {
        if (alive && current === request) { setRows(result.found); setNext(result.more); }
      }).catch(reason => {
        if (alive && current === request) setError(`미확인 반려동물을 불러오지 못했어요. ${String(reason)}`);
      }).finally(() => {
        if (alive && current === request) setLoading(false);
      });
    };
    refresh();
    window.addEventListener('gamjassak-pet-results', refresh);
    return () => { alive = false; window.removeEventListener('gamjassak-pet-results', refresh); };
  }, [page, photoById]);

  const toggle = (id: string) => setSelection(current =>
    current.includes(Number(id)) ? current.filter(value => value !== Number(id)) : [...current, Number(id)]);
  const drag = useRowSelection(selecting && !loading && !saving, toggle, id => selection.includes(Number(id)));

  async function connectSelected(assignment: Assignment) {
    if (savingLock.current) return;
    if (!selection.length) throw new Error('연결할 반려동물을 선택해 주세요.');
    if (assignment.target === null && !assignment.name?.trim()) throw new Error('새 반려동물 이름을 입력해 주세요.');
    if (assignment.target !== null && !pets.some(pet => pet.id === assignment.target)) throw new Error('연결할 기존 반려동물을 선택해 주세요.');
    savingLock.current = true;
    setSaving(true); setError(''); setNotice('');
    const ids = [...selection];
    try {
      // Keep the original selection intact if the native transaction rejects it
      // (stale result, changed source, or incompatible dog/cat).
      await assignPetDetections(ids, assignment);
    } catch (reason) {
      setError(`연결하지 못했어요. ${reason instanceof Error ? reason.message : String(reason)} 선택은 유지돼요.`);
      savingLock.current = false; setSaving(false);
      throw reason;
    }
    setSelection(current => current.filter(id => !ids.includes(id)));
    setTarget('');
    const name = assignment.target === null ? assignment.name?.trim() : pets.find(pet => pet.id === assignment.target)?.name;
    setNotice(`${name ?? '반려동물'}에 ${ids.length}개 인식 결과를 연결했어요.`);
    // A failed refresh is not a failed write. Do not resubmit saved detections.
    try {
      await onSaved();
      const result = await read(0);
      setRows(result.found); setNext(result.more); setPage(0);
    } catch {
      setRows(current => current.filter(row => !ids.includes(row.id)));
      setNotice('연결은 저장됐지만 목록을 다시 불러오지 못했어요. 반려동물 메뉴를 다시 열어 확인해 주세요.');
    } finally {
      savingLock.current = false; setSaving(false);
      window.dispatchEvent(new Event('gamjassak-pet-results'));
    }
  }

  return <section aria-label="미확인 반려동물">
    {!selecting && <FunctionHelp title="미확인 반려동물"><p>인식한 동물만 선택해 연결합니다. 미확인 사진은 사진 연결로 이름을 지정할 수 있어요. 같은 사진의 다른 반려동물은 유지됩니다.</p></FunctionHelp>}
    {loading && <p role="status">미확인 반려동물 불러오는 중…</p>}
    {!selecting && error && <p role="alert">{error}</p>}
    {!selecting && notice && <p role="status">{notice}</p>}
    {!loading && !rows.length && !error && <p>미확인 반려동물이 없습니다. 등록한 반려동물의 사진을 기준으로 ‘반려동물 사진 찾기’를 사용할 수 있어요.</p>}
    <div className="petGrid" {...drag}>{rows.map(row => {
      const item = photoById.get(row.media_id);
      if (!item) return null; // Photos can change while a native list request is pending.
      return <button key={row.id} className="petPhoto" data-selection-id={row.id}
        disabled={loading || saving}
        aria-label={selecting ? `반려동물 선택 ${row.id}` : `반려동물 사진 상세보기 ${row.id}`}
        aria-pressed={selecting ? selection.includes(row.id) : undefined}
        onClick={() => { if (selecting) toggle(String(row.id)); else onOpen(item, photos); }}>
        <div className="petDetectionPreview" style={{ aspectRatio: ratios[item.id] ?? (item.width && item.height ? item.width / item.height : 1) }}
          onLoadCapture={event => { const image = event.target; if (image instanceof HTMLImageElement && image.naturalHeight) { const ratio = image.naturalWidth / image.naturalHeight; setRatios(current => current[item.id] === ratio ? current : { ...current, [item.id]: ratio }); } }}>
          <MediaVisual item={item} />
          {row.box_ && <span className="petDetectionBox" style={{ left: `${row.box_[0] * 100}%`, top: `${row.box_[1] * 100}%`, width: `${row.box_[2] * 100}%`, height: `${row.box_[3] * 100}%` }} />}
        </div>
        {selecting && <span className={`faceCheck ${selection.includes(row.id) ? 'checked' : ''}`} aria-hidden="true">{selection.includes(row.id) && <Check size={22} />}</span>}
        <span>{row.id < 0 ? '미확인 사진' : '미확인 반려동물'}</span>
      </button>;
    })}</div>
    {(page > 0 || next) && <div className="peopleActions">
      <button disabled={loading || saving || !page} onClick={() => setPage(page - 1)}>이전</button>
      <span>{page + 1}</span>
      <button disabled={loading || saving || !next} onClick={() => setPage(page + 1)}>다음</button>
    </div>}
    {selecting && <EntitySelectionBar count={selection.length} unit="반려동물 인식 결과"
      help={<><p>동물을 선택한 뒤 기존 반려동물을 골라 바로 연결할 수 있어요. 새 반려동물도 등록할 수 있어요.</p><p>전체 선택은 현재 페이지에 적용됩니다.</p></>}
      allLabel="현재 페이지 전체 선택" busy={loading || saving}
      onAll={() => setSelection(current => [...new Set([...current, ...rows.map(row => row.id)])])}
      onClear={() => setSelection([])}
      onClose={() => { setSelection([]); window.dispatchEvent(new Event('gamjassak-unknown-pet-selection-close')); }}>
      <div className="petUnknownAssign">
        {pets.length > 0 && <>
          <label>기존 반려동물
            <select aria-label="연결할 기존 반려동물" value={target} disabled={saving || loading || !selection.length} onChange={event => setTarget(event.target.value)}>
              <option value="">연결할 반려동물 선택</option>
              {pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
            </select>
          </label>
          <button className="primaryControl" disabled={saving || loading || !selection.length || !target}
            onClick={() => void connectSelected({ target: Number(target), name: null }).catch(() => undefined)}>선택한 반려동물 연결</button>
        </>}
        <button disabled={saving || loading || !selection.length} onClick={() => setAssigning(true)}>새 반려동물 등록</button>
        {error && <p className="petUnknownFeedback" role="alert">{error}</p>}
        {notice && <p className="petUnknownFeedback" role="status">{notice}</p>}
      </div>
    </EntitySelectionBar>}
    {assigning && <EntityAssignmentDialog kind="pet" entries={pets} initialMode="new" count={selection.length}
      unit="반려동물 인식 결과" onClose={() => setAssigning(false)} onSave={connectSelected} />}
  </section>;
}
