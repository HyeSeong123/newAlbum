import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { MediaVisual } from '../../components/MediaVisual';
import type { MediaItem } from '../../types/media';
import type { Pet } from './petService';
import type { PetAnalysis } from './usePetAnalysis';
import { confirmPetDetection, listPetDetections, loadPetReferences } from './engine/manager';
import { recognizePet } from './engine/matcher';
import type { PetDetection } from './engine/types';

interface Match { detection: PetDetection; pet: Pet; item: MediaItem }
/** Photo-first search. Analysis uses the app's durable queue, never a second worker. */
export function PetPhotoSearch({ photos, pets, pet, analysis, onClose, onSaved }: {
  photos: MediaItem[]; pets: Pet[]; pet?: Pet; analysis: PetAnalysis; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [matches, setMatches] = useState<Match[]>([]), [page, setPage] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [hasNext, setHasNext] = useState(false), [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const connected = useRef(new Set<string>());
  const cursors = useRef([0]), alive = useRef(true), request = useRef(0), locked = useRef(false);
  const byId = useMemo(() => new Map(photos.map(item => [Number(item.id), item])), [photos]);
  const registered = useMemo(() => new Map(pets.map(entry => [entry.id, entry])), [pets]);
  const refresh = useCallback(async () => {
    const token = ++request.current;
    const refs = await loadPetReferences();
    if (!refs.length) { if (alive.current && token === request.current) { setMatches([]); setHasNext(false); } return; }
    let cursor = cursors.current[page] ?? 0;
    const found: Match[] = [];
    let more = false;
    // Fetch at most 100 feature vectors at a time; keep only one UI page.
    for (;;) {
      const rows = await listPetDetections(null, cursor, false, 100) ?? [];
      for (let index = 0; index < rows.length; index++) {
        const detection = rows[index]; cursor = detection.id;
        if (detection.excluded || detection.pet_id !== null) continue;
        const item = byId.get(detection.media_id);
        if (!item) continue;
        // Match against all pets first: filtering references to one pet could
        // turn another pet's better match into a misleading suggestion.
        const candidate = recognizePet(detection, refs).candidates[0];
        const owner = candidate && registered.get(candidate.petId);
        if (!owner || pet && owner.id !== pet.id || owner.media_ids.includes(detection.media_id) || connected.current.has(`${owner.id}:${detection.media_id}`)) continue;
        found.push({ detection, pet: owner, item });
        if (found.length === 24) { more = index < rows.length - 1 || rows.length === 100; break; }
      }
      if (found.length === 24 || rows.length < 100) break;
      if (!alive.current || token !== request.current) return;
    }
    if (alive.current && token === request.current) {
      cursors.current[page + 1] = cursor; setMatches(found.filter(match => !connected.current.has(`${match.pet.id}:${match.detection.media_id}`))); setHasNext(more);
    }
  }, [byId, registered, page, pet]);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => void refresh().catch(reason => { if (alive.current) setError(String(reason instanceof Error ? reason.message : reason)); });
    const update = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    load(); window.addEventListener('gamjassak-pet-results', update);
    return () => { alive.current = false; request.current++; clearTimeout(timer); window.removeEventListener('gamjassak-pet-results', update); };
  }, [refresh]);
  const eligible = pet ? [pet] : pets;
  const canSearch = eligible.some(entry => entry.media_ids.some(id => byId.has(id)));
  function search() {
    setError(''); setPage(0); cursors.current = [0];
    // Enroll connected photos before searching the rest of the library. Cached
    // scans are reused; this also makes older manual registrations searchable.
    for (const owner of eligible) analysis.start(photos.filter(item => owner.media_ids.includes(Number(item.id))).slice(0, 12), owner.id);
    analysis.start(photos);
    if (analysis.waiting) analysis.resume();
  }
  async function connect(match: Match) {
    if (locked.current) return;
    locked.current = true; setSaving(match.detection.id); setError('');
    try {
      await confirmPetDetection(match.detection.id, match.pet.id, match.detection.view);
      connected.current.add(`${match.pet.id}:${match.detection.media_id}`);
      setMatches(current => current.filter(row => row.pet.id !== match.pet.id || row.detection.media_id !== match.detection.media_id));
      window.dispatchEvent(new Event('gamjassak-pet-results'));
      // Parent updates replace the pets snapshot. Its effect refreshes results;
      // never launch another request with this render's older memberships.
      await onSaved();
    } catch (reason) { if (alive.current) setError(String(reason instanceof Error ? reason.message : reason)); }
    finally { locked.current = false; if (alive.current) setSaving(null); }
  }
  return <EntityEditorDialog title="등록된 사진에서 찾기" busy={saving !== null} onClose={onClose} className="petPhotoSearch">
    <div className="entityEditBody">
      <p>{pet ? `${pet.name}의 연결된 사진과 비교합니다.` : '반려동물별로 연결한 사진과 비교합니다.'} 찾은 사진에서 같은 반려동물인지 확인한 뒤 연결하세요.</p>
      {!canSearch && <p>먼저 이름·사진 수정에서 반려동물이 나온 사진을 한 장 이상 연결해 주세요.</p>}
      <div className="peopleActions">{analysis.progress?.running ? <button onClick={analysis.cancel}>찾기 중단</button> : <button className="primaryControl" disabled={!canSearch || !photos.length} onClick={search}>사진 찾기 시작</button>}</div>
      {analysis.progress && <p role="status">{analysis.progress.message}</p>}
      {analysis.progress?.running && <progress aria-label="반려동물 사진 찾기 진행" value={analysis.progress.done} max={analysis.progress.total || 1} />}
      {error && <p role="alert">{error}</p>}
      <strong>연결할 사진</strong>
      {!matches.length && <p>{analysis.progress?.running ? '사진을 찾고 있어요. 발견한 사진은 여기에 표시됩니다.' : '아직 연결할 사진이 없습니다. 사진 찾기를 실행하거나 다른 사진을 연결해 보세요.'}</p>}
      <div className="petSearchGrid">{matches.map(match => <article key={match.detection.id} className="petSearchCard">
        <div className="petDetectionPreview" style={{ aspectRatio: ratios[match.item.id] ?? (match.item.width && match.item.height ? match.item.width / match.item.height : 1) }} onLoadCapture={event => {
          const image = event.target;
          if (image instanceof HTMLImageElement && image.naturalHeight) {
            const ratio = image.naturalWidth / image.naturalHeight;
            setRatios(current => current[match.item.id] === ratio ? current : { ...current, [match.item.id]: ratio });
          }
        }}><MediaVisual item={match.item} /><span className="petDetectionBox" style={{ left: `${match.detection.box[0] * 100}%`, top: `${match.detection.box[1] * 100}%`, width: `${match.detection.box[2] * 100}%`, height: `${match.detection.box[3] * 100}%` }} /></div>
        <strong>{match.pet.name}</strong><small>{match.item.takenAt ?? match.item.fileName}</small>
        <button disabled={saving !== null} aria-label={`${match.pet.name} 사진 연결 ${match.detection.id}`} onClick={() => void connect(match)}><Check size={16}/>{saving === match.detection.id ? '연결 중…' : '사진 연결'}</button>
      </article>)}</div>
      {(page > 0 || hasNext) && <div className="peopleActions"><button title="이전 사진" disabled={!page || saving !== null} onClick={() => setPage(page - 1)}><ChevronLeft size={18}/></button><span>{page + 1}</span><button title="다음 사진" disabled={!hasNext || saving !== null} onClick={() => setPage(page + 1)}><ChevronRight size={18}/></button></div>}
    </div>
    <footer className="peopleActions entityEditFooter"><button disabled={saving !== null} onClick={onClose}>닫기</button></footer>
  </EntityEditorDialog>;
}
