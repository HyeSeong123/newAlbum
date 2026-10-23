import { FunctionHelp } from '../../components/FunctionHelp';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, ScanSearch, Pause, Play } from 'lucide-react';
import { useRowSelection } from '../../hooks/useRowSelection';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { loadSavedAlbums } from '../../services/tauriMediaService';
import type { SavedAlbum } from '../../types/media';
import { MediaVisual } from '../../components/MediaVisual';
import type { MediaItem } from '../../types/media';
import type { Pet } from './petService';
import type { PetAnalysis } from './usePetAnalysis';
import { confirmPetDetection, listPetDetections, loadPetReferences } from './engine/manager';
import { rejectPetCandidate } from './engine/manager';
import { recognizePet } from './engine/matcher';
import type { PetDetection, PetCandidate } from './engine/types';

interface Match { detection: PetDetection; pet: Pet; item: MediaItem; candidates: PetCandidate[] }
/** Photo-first search. Analysis uses the app's durable queue, never a second worker. */
export function PetPhotoSearch({ photos, pets, pet, analysis, onClose, onSaved }: {
  photos: MediaItem[]; pets: Pet[]; pet?: Pet; analysis: PetAnalysis; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [matches, setMatches] = useState<Match[]>([]), [page, setPage] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [hasNext, setHasNext] = useState(false), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState(() => new Map<number, Match>());
  const [albums,setAlbums]=useState<SavedAlbum[]>([]),[scope,setScope]=useState('all');
  const [notice, setNotice] = useState('');
  const connected = useRef(new Set<string>());
  const cursors = useRef([0]), alive = useRef(true), request = useRef(0), locked = useRef(false);
  const byId = useMemo(() => new Map(photos.map(item => [Number(item.id), item])), [photos]);
  const scopedPhotos=useMemo(()=>scope==='all'?photos:photos.filter(item=>albums.find(album=>album.id===scope)?.items.some(photo=>photo.id===item.id)),[photos,albums,scope]);
  const searchById=useMemo(()=>new Map(scopedPhotos.map(item=>[Number(item.id),item])),[scopedPhotos]);
  useEffect(()=>{let active=true;void loadSavedAlbums().then(rows=>{if(active)setAlbums(rows);}).catch(()=>{if(active)setError('앨범을 불러오지 못했습니다. 모든 사진에서는 계속 찾을 수 있습니다.');});return()=>{active=false;};},[]);
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
        if(index%8===0){await new Promise(resolve=>setTimeout(resolve,0));if(!alive.current||token!==request.current)return;}
        const detection = rows[index]; cursor = detection.id;
        if (detection.excluded || detection.pet_id !== null) continue;
        const item = searchById.get(detection.media_id);
        if (!item) continue;
        // Match against all pets first: filtering references to one pet could
        // turn another pet's better match into a misleading suggestion.
        const candidates = recognizePet(detection, refs).candidates;
        const candidate = pet ? candidates.find(candidate=>candidate.petId===pet.id) : candidates[0];
        const owner = candidate && registered.get(candidate.petId);
        if (!owner || pet && owner.id !== pet.id || owner.media_ids.includes(detection.media_id) || connected.current.has(`${owner.id}:${detection.media_id}`)) continue;
        found.push({ detection, pet: owner, item, candidates });
        if (found.length === 24) { more = index < rows.length - 1 || rows.length === 100; break; }
      }
      if (found.length === 24 || rows.length < 100) break;
      if (!alive.current || token !== request.current) return;
    }
    if (alive.current && token === request.current) {
      cursors.current[page + 1] = cursor; setMatches(found.filter(match => !connected.current.has(`${match.pet.id}:${match.detection.media_id}`))); setHasNext(more);
    }
  }, [searchById, registered, page, pet]);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => void refresh().catch(reason => { if (alive.current) setError(String(reason instanceof Error ? reason.message : reason)); });
    const update = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    load(); window.addEventListener('gamjassak-pet-results', update);
    return () => { alive.current = false; request.current++; clearTimeout(timer); window.removeEventListener('gamjassak-pet-results', update); };
  }, [refresh]);
  function toggle(id: string) {
    if (locked.current) return;
    const match = matches.find(row => row.detection.id === Number(id));
    if (!match) return;
    setSelection(current => { const next = new Map(current); if(next.has(match.detection.id))next.delete(match.detection.id);else next.set(match.detection.id,match);return next; });
  }
  function chooseCandidate(id:number,petId:number) {
    const owner=registered.get(petId),match=matches.find(match=>match.detection.id===id);
    if(!owner||!match||locked.current)return;
    const changed={...match,pet:owner};setMatches(current=>current.map(row=>row.detection.id===id?changed:row));
    setSelection(current=>current.has(id)?new Map([...current].map(([key,value])=>[key,key===id?changed:value])):current);
  }
  async function rejectSelected(rows:Match[]) {
    if(locked.current||!rows.length)return;locked.current=true;setSaving(true);setError('');
    const succeeded=new Set<number>();
    try {for(const row of rows){await rejectPetCandidate(row.detection.id,row.pet.id);succeeded.add(row.detection.id);}setNotice(`후보 ${succeeded.size}개를 제외했습니다.`);}
    catch(reason){setError(String(reason instanceof Error?reason.message:reason));}
    finally{setSelection(current=>new Map([...current].filter(([id])=>!succeeded.has(id))));setMatches(current=>current.filter(row=>!succeeded.has(row.detection.id)));locked.current=false;setSaving(false);window.dispatchEvent(new Event('gamjassak-pet-results'));}
  }
  const drag = useRowSelection(!saving, toggle, id => selection.has(Number(id)));
  const eligible = pet ? [pet] : pets;
  const canSearch = eligible.some(entry => entry.media_ids.some(id => byId.has(id)));
  function search() {
    if (locked.current) return;
    setError(''); setNotice(''); setSelection(new Map()); setPage(0); cursors.current = [0];
    // Enroll connected photos before searching the rest of the library. Cached
    // scans are reused; this also makes older manual registrations searchable.
    for (const owner of eligible) analysis.start(photos.filter(item => owner.media_ids.includes(Number(item.id))).slice(0, 12), owner.id);
    analysis.start(scopedPhotos);
    if (analysis.waiting) analysis.resume();
  }
  async function connectSelected() {
    if (locked.current || !selection.size) return;
    locked.current = true; setSaving(true); setError(''); setNotice('');
    const succeeded = new Set<number>();
    let problem = '';
    try {
      for (const match of selection.values()) {
        try {
          await confirmPetDetection(match.detection.id, match.pet.id, match.detection.view);
          succeeded.add(match.detection.id);
          connected.current.add(`${match.pet.id}:${match.detection.media_id}`);
        } catch (reason) { problem = String(reason instanceof Error ? reason.message : reason); break; }
      }
      if (alive.current) {
        setSelection(current => new Map([...current].filter(([id]) => !succeeded.has(id))));
        setMatches(current => current.filter(row => !connected.current.has(`${row.pet.id}:${row.detection.media_id}`)));
        if(succeeded.size) setNotice(`${succeeded.size}개 선택을 연결했어요.`);
        if(problem) setError(`${problem} 완료한 연결은 저장했고, 남은 선택은 유지했어요.`);
      }
      if(succeeded.size) { window.dispatchEvent(new Event('gamjassak-pet-results')); await onSaved(); }
    } catch (reason) { if (alive.current) setError(`연결된 사진의 목록을 갱신하지 못했어요. ${String(reason instanceof Error ? reason.message : reason)}`); }
    finally { locked.current = false; if (alive.current) setSaving(false); }
  }
  return <EntityEditorDialog title="반려동물 사진 찾기" busy={saving} onClose={onClose} className="petPhotoSearch">
    <div className="entityEditBody">
      <FunctionHelp title="반려동물 사진 찾기"><p>{pet ? `${pet.name}의 연결된 사진과 비교합니다.` : '반려동물별로 연결한 사진과 비교합니다.'} 찾은 사진에서 같은 반려동물인지 확인한 뒤 연결하세요.</p></FunctionHelp>
      {!canSearch && <p>먼저 사진 연결에서 반려동물이 나온 사진을 한 장 이상 연결해 주세요.</p>}
      <label className="petSearchScope">검색 범위<select aria-label="반려동물 검색 범위" value={scope} disabled={saving||analysis.progress?.running} onChange={event=>{setScope(event.target.value);setSelection(new Map());setPage(0);cursors.current=[0];}}><option value="all">모든 사진 ({photos.length}장)</option>{albums.map(album=><option key={album.id} value={album.id}>{album.title}</option>)}</select></label>
      <div className="petSearchActions">{analysis.progress?.running ? <button disabled={saving} onClick={analysis.cancel}><Pause size={18} />찾기 중단</button> : <><button className="primaryControl" disabled={saving || !canSearch || !scopedPhotos.length} onClick={search}><ScanSearch size={18} />사진 찾기 시작</button>{analysis.waiting > 0 && <button disabled={saving || !canSearch} onClick={analysis.resume}><Play size={18} />이어서 분석</button>}</>}</div>
      {analysis.progress && <p role="status">{analysis.progress.message}</p>}
      {analysis.progress?.running && <progress aria-label="반려동물 사진 찾기 진행" value={analysis.progress.done} max={analysis.progress.total || 1} />}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="petSearchSelection"><strong>연결할 사진 · {selection.size}개 선택</strong><div><button disabled={saving || !matches.length} onClick={() => setSelection(current => new Map([...current, ...matches.map(match => [match.detection.id,match] as const)]))}>현재 페이지 선택</button><button disabled={saving || !selection.size} onClick={() => setSelection(new Map())}>선택 해제</button></div></div>
      {!matches.length && <p>{analysis.progress?.running ? '사진을 찾고 있어요. 발견한 사진은 여기에 표시됩니다.' : '아직 연결할 사진이 없습니다. 사진 찾기를 실행하거나 다른 사진을 연결해 보세요.'}</p>}
      <div className="petSearchGrid" {...drag}>{matches.map(match => <article key={match.detection.id} className={`petSearchCard${selection.has(match.detection.id) ? ' selected' : ''}`}>
        <div className="petDetectionPreview" style={{ aspectRatio: ratios[match.item.id] ?? (match.item.width && match.item.height ? match.item.width / match.item.height : 1) }} onLoadCapture={event => {
          const image = event.target;
          if (image instanceof HTMLImageElement && image.naturalHeight) {
            const ratio = image.naturalWidth / image.naturalHeight;
            setRatios(current => current[match.item.id] === ratio ? current : { ...current, [match.item.id]: ratio });
          }
        }}><MediaVisual item={match.item} /><span className="petDetectionBox" style={{ left: `${match.detection.box[0] * 100}%`, top: `${match.detection.box[1] * 100}%`, width: `${match.detection.box[2] * 100}%`, height: `${match.detection.box[3] * 100}%` }} /></div>
        <label>반려동물 후보<select aria-label={`반려동물 후보 ${match.detection.id}`} disabled={saving} value={match.pet.id} onChange={event=>chooseCandidate(match.detection.id,Number(event.target.value))}>{pets.filter(owner=>!match.detection.rejected_pet_ids?.includes(owner.id)).map(owner=><option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
        <button disabled={saving} onClick={()=>void rejectSelected([match])}>이 후보 제외</button><small>{match.item.takenAt ?? match.item.fileName}</small>
        <button disabled={saving} data-selection-id={match.detection.id} aria-pressed={selection.has(match.detection.id)} aria-label={`${match.pet.name} 사진 선택 ${match.detection.id}`} onClick={() => toggle(String(match.detection.id))}><Check size={16}/>{selection.has(match.detection.id) ? '선택됨' : '사진 선택'}</button>
      </article>)}</div>
      {(page > 0 || hasNext) && <div className="peopleActions"><button title="이전 사진" disabled={!page || saving} onClick={() => setPage(page - 1)}><ChevronLeft size={18}/></button><span>{page + 1}</span><button title="다음 사진" disabled={!hasNext || saving} onClick={() => setPage(page + 1)}><ChevronRight size={18}/></button></div>}
    </div>
    <footer className="peopleActions entityEditFooter"><button disabled={saving} onClick={onClose}>닫기</button><button disabled={saving || !selection.size} onClick={()=>void rejectSelected([...selection.values()])}>선택한 후보 제외</button><button className="primaryControl" disabled={saving || !selection.size} onClick={() => void connectSelected()}>{saving ? <LoaderCircle size={18} className="spinIcon" /> : <Check size={18}/>}선택한 사진 연결{selection.size > 0 ? ` (${selection.size})` : ''}</button></footer>
  </EntityEditorDialog>;
}
