import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, X } from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { normalizeLocalFilePath } from '../media/mediaSource';
import { MediaVisual } from '../../components/MediaVisual';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import type { MediaItem } from '../../types/media';
import { savePet, type Pet } from './petService';
import type { PetFeature } from './petRecognition';

export function PetMatchReview({ pet, photos, onClose, onSaved }: { pet: Pet; photos: MediaItem[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<{ item: MediaItem; score: number }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [page, setPage] = useState(0);
  const alive = useRef(true);
  const stop = useRef(false);
  const locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current = true; }; }, []);
  useModalBehavior(() => { if (!saving) onClose(); });
  async function start() {
    if (locked.current) return;
    locked.current = true; stop.current = false;
    setRunning(true); setError(''); setStatus('모델 준비 중'); setMatches([]); setChosen([]); setPage(0);
    const references = photos.filter((item) => pet.media_ids.includes(Number(item.id)));
    const candidates = photos.filter((item) => !pet.media_ids.includes(Number(item.id)));
    setProgress({ done: 0, total: references.length + candidates.length });
    try {
      const { describePets, similarity } = await import('./petRecognition');
      const describe = async (item: MediaItem) => {
        const path = await invoke<string>('media_thumbnail', { id: Number(item.id) });
        if (!path) throw new Error('썸네일을 준비하지 못했습니다. 앱을 다시 실행해 주세요.');
        return describePets(convertFileSrc(normalizeLocalFilePath(path)));
      };
      const features: PetFeature[] = [];
      let done = 0, failed = 0, skipped = 0;
      for (const item of references) {
        if (stop.current) break;
        if (alive.current) setStatus('기준 사진 확인 중');
        const found = await describe(item);
        // Multiple animals in a reference are ambiguous; never assign all to this pet.
        if (found.length === 1) features.push(found[0]); else skipped++;
        if (alive.current) setProgress({ done: ++done, total: references.length + candidates.length });
      }
      if (!stop.current && !features.length) throw new Error('기준 사진에서 반려동물을 구분하지 못했습니다. 개 또는 고양이 한 마리가 선명하게 나온 사진을 연결해 주세요.');
      if (!stop.current && new Set(features.map((feature) => feature.kind)).size > 1) throw new Error('기준 사진에 개와 고양이가 함께 등록되어 있습니다. 같은 반려동물의 사진만 연결해 주세요.');
      const found: { item: MediaItem; score: number }[] = [];
      for (const item of candidates) {
        if (stop.current) break;
        if (alive.current) setStatus('등록된 사진 비교 중');
        try {
          const score = similarity(features, await describe(item));
          if (score >= 0.7) found.push({ item, score });
        } catch { failed++; }
        if (alive.current) {
          setProgress({ done: ++done, total: references.length + candidates.length });
          setMatches([...found].sort((a, b) => b.score - a.score));
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive.current) {
        setStatus(stop.current ? '분석을 중단했습니다.' : `후보 ${found.length}장을 찾았습니다.`);
        if (failed || skipped) setError(`비교 실패 ${failed}장 · 기준에서 제외 ${skipped}장`);
      }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '분석하지 못했습니다.'); }
    finally { locked.current = false; if (alive.current) setRunning(false); }
  }
  async function apply() {
    if (locked.current || !chosen.length) return;
    locked.current = true; setSaving(true); setError('');
    try {
      await savePet(pet.id, pet.name, [...new Set([...pet.media_ids, ...chosen.map(Number)])], pet.cover_media_id);
      await onSaved(); onClose();
    } catch { setError('연결하지 못했습니다. 다시 시도해 주세요.'); }
    finally { locked.current = false; setSaving(false); }
  }
  const pages = Math.max(1, Math.ceil(matches.length / 24));
  return <div className="modalBackdrop"><section className="petEditor" role="dialog" aria-modal="true" aria-labelledby="petMatchTitle">
    <header className="detailHeader"><strong id="petMatchTitle">{pet.name} 후보 확인</strong><button title="닫기" className="closeButton" disabled={saving} onClick={onClose}><X size={18} /></button></header>
    <div className="petMatchBody">
      <div className="peopleActions">{running ? <button onClick={() => { stop.current = true; }}><Pause size={18} />중단</button> : <button disabled={saving} onClick={() => void start()}><Play size={18} />후보 찾기</button>}<span role="status">{status}</span></div>
      {running && <progress aria-label="사진 비교 진행" value={progress.done} max={progress.total || 1} />}
      <p className="petMatchNotice">외형이 비슷한 후보입니다. 같은 반려동물인지 확인해 주세요.</p>
      {error && <p role="alert">{error}</p>}
      <div className="petGrid">{matches.slice(page * 24, (page + 1) * 24).map(({ item }) => <button key={item.id} className="petPhoto" disabled={running || saving} aria-label="후보 선택" aria-pressed={chosen.includes(item.id)} onClick={() => setChosen((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
        <MediaVisual item={item} /><span className={`faceCheck ${chosen.includes(item.id) ? 'checked' : ''}`} aria-hidden="true">{chosen.includes(item.id) && <Check size={22} />}</span><span>{item.takenAt ?? '날짜 없음'}</span>
      </button>)}</div>
      <div className="peopleActions">{pages > 1 && <><button title="이전 페이지" disabled={!page} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {pages}</span><button title="다음 페이지" disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></>}
      <button disabled={running || saving || !chosen.length} onClick={() => void apply()}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}선택한 사진 연결 ({chosen.length})</button></div>
    </div>
  </section></div>;
}
