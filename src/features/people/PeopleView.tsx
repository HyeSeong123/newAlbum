import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookPlus, Check, FolderOutput, Image as ImageIcon, ImagePlus, LoaderCircle, MoreVertical, Pause, Pencil, Play, RefreshCw, Scissors, Trash2, Users, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { clearFaceIndex, retryEmptyFaceScans, controlPersonJobs, enqueuePersonPhotos, finishPersonJob, emptyFaceIndex, FaceIndex, loadFaceEngine, loadFaceIndex, moveFaces, renamePerson, scanPhoto, setFacesExcluded, setPersonCoverFace, saveManualPersonPhotos, mergeRegisteredPeople } from './faceService';
import { EmptyState, FavoriteBadge, MediaVisual } from '../../components/MediaVisual';
import { useRowSelection } from '../../hooks/useRowSelection';
import './people.css';
import { FaceMatchReview } from './FaceMatchReview';
import { PersonEvaluationPanel } from './PersonEvaluationPanel';
import { PersonSourceAuditPanel } from './PersonSourceAuditPanel';
import { auditPersonSources } from './engine/sourceAudit';
import { PersonDeviceBenchmarkPanel } from './PersonDeviceBenchmarkPanel';
import { ExportModal } from '../../components/ExportModal';
import { ActionMenu } from '../../components/ActionMenu';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { EMPTY_FACES, indexFaces, mediaForFaces } from './peopleModel';
import { EntityPhotoPicker } from '../../components/EntityPhotoPicker';
import { EntityAssignmentDialog } from '../entities/EntityAssignmentDialog';
import { EntitySelectionBar } from '../entities/EntitySelectionBar';
import { assignPersonFaces, editEntityPhotos, removePersonRegistration, setPersonCoverPhoto, removeEntityRegistrations } from '../entities/entityService';

export function PeopleView({ items, onOpen, onCreateAlbum, query = "", isActive = true }: { isActive?: boolean; items: MediaItem[]; query?: string; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; onCreateAlbum: (items: MediaItem[]) => void }) {
  const [index, setIndex] = useState<FaceIndex>(emptyFaceIndex);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  // Diagnostic panels are development fixtures, never a user-facing menu.
  const [validating] = useState(import.meta.env.DEV && new URLSearchParams(location.search).get('peopleDiagnostics') === '1');
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [faceView, setFaceView] = useState<'people' | 'all' | 'unknown'>('people');
  const [selecting, setSelecting] = useState(false);
  const [photoSelecting, setPhotoSelecting] = useState(false);
  const [peopleSelecting,setPeopleSelecting]=useState(false), [selectedPeople,setSelectedPeople]=useState<number[]>([]);
  const [assignment, setAssignment] = useState<'faces' | 'photos' | 'groups' | null>(null);
  const [sort, setSort] = useState('name');
  const [choosingCover, setChoosingCover] = useState(false);
  const [lastExcluded, setLastExcluded] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [active, setActive] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [manualPhotos, setManualPhotos] = useState(false);
  const manualTarget = useRef<number | null>(null);
  const [nameMode, setNameMode] = useState<'new' | 'existing'>('new');
  const [chosen, setChosen] = useState<number[]>([]);
  const [target, setTarget] = useState('');
  const [facePage, setFacePage] = useState(0);
  const [personPage, setPersonPage] = useState(0);
  const [unknownPage, setUnknownPage] = useState(0);
  const [selectingUnknown, setSelectingUnknown] = useState(false);
  const [unknownChosen, setUnknownChosen] = useState<number[]>([]);
  const alive = useRef(false);
  const stop = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
  const desktop = isTauriRuntime();
  const photos = useMemo(() => items.filter((item) => item.fileType === 'image'), [items]);
  const mediaById = useMemo(() => new Map(items.map((item) => [Number(item.id), item])), [items]);
  const lookup = useMemo(() => indexFaces(index), [index]);
  const remaining = useMemo(() => photos.filter((item) => !lookup.scanned.has(Number(item.id))), [photos, lookup]);
  const scannedWithoutFaces = useMemo(() => { const found = new Set(index.faces.map(face => face.media_id)); return photos.filter(photo => lookup.scanned.has(Number(photo.id)) && !found.has(Number(photo.id))); }, [index.faces, photos, lookup]);
  const retryOnly = !remaining.length && scannedWithoutFaces.length > 0;
  const findLabel = retryOnly ? '못 찾은 사진 다시 찾기' : index.scanned.length ? '새 사진에서 사람 찾기' : '사진에서 사람 찾기';
  const person = active === null ? undefined : lookup.peopleById.get(active);
  const allFaces = faceView === 'all';
  const showUnknownFaces = faceView === 'unknown';
  const showFaceThumbnails = allFaces || showUnknownFaces;
  const unidentifiedFaces = lookup.unidentified;
  const personFaces = active === null ? EMPTY_FACES : lookup.byPerson.get(active) ?? EMPTY_FACES;
  const faces = allFaces ? index.faces : showUnknownFaces ? unidentifiedFaces : personFaces;
  const faceItems = useMemo(() => mediaForFaces(items, faces), [items, faces]);
  const showDirectory = !allFaces && (Boolean(person) || showUnknownFaces);
  const showManualPhotos = Boolean(person && !selecting && !showFaceThumbnails);
  const personItems = useMemo(() => mediaForFaces(items, personFaces, person?.media_ids), [items, personFaces, person]);
  const automaticIds = useMemo(() => [...new Set(personFaces.map(face => face.media_id))], [personFaces]);
  const facePages = Math.max(1, Math.ceil((showManualPhotos ? personItems.length : faces.length) / 24));
  const currentFacePage = Math.min(facePage, facePages - 1);
  const search = query.trim().toLocaleLowerCase();
  const personCounts=useMemo(()=>new Map(index.people.map(entry=>[entry.id,new Set([...(lookup.byPerson.get(entry.id)??[]).map(face=>face.media_id),...entry.media_ids??[]]).size])),[index.people,lookup]);
  const matchingPeople = useMemo(() => index.people.filter((entry) => (entry.name.trim() || "미확인 인물").toLocaleLowerCase().includes(search)).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : ((personCounts.get(b.id)??0)-(personCounts.get(a.id)??0))), [index.people, search, sort, personCounts]);
  useEffect(() => { setPersonPage(0); setUnknownPage(0); openFaceView('people'); }, [query]);
  const personGroups = [
    { title: '등록된 인물', people: matchingPeople.filter((entry) => entry.name.trim()), page: personPage, setPage: setPersonPage },
    { title: '미확인 인물', people: matchingPeople.filter((entry) => !entry.name.trim()), page: unknownPage, setPage: setUnknownPage },
  ];
  const blocked = running || saving || loading || evaluationBusy || benchmarkBusy || auditBusy;
  const unknownFaceIds = useMemo(() => {
    const selectedPeople = new Set(unknownChosen);
    return unidentifiedFaces.filter((face) => selectedPeople.has(face.person_id)).map((face) => face.id);
  }, [unidentifiedFaces, unknownChosen]);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const toggleFace = (id: string) => setChosen((current) => current.includes(Number(id)) ? current.filter((entry) => entry !== Number(id)) : [...current, Number(id)]);
  const dragSelection = useRowSelection((selecting || photoSelecting) && !blocked, toggleFace, (id) => chosenSet.has(Number(id)));
  const peopleDrag=useRowSelection(peopleSelecting && !blocked,id=>setSelectedPeople(current=>current.includes(Number(id))?current.filter(value=>value!==Number(id)):[...current,Number(id)]),id=>selectedPeople.includes(Number(id)));
  useEffect(()=>{if(!isActive){setSelecting(false);setPhotoSelecting(false);setSelectingUnknown(false);setUnknownChosen([]);setChosen([]);setPeopleSelecting(false);setSelectedPeople([]);setAssignment(null);setChoosingCover(false);setManualPhotos(false);setEditingName(false);setReviewing(false);}},[isActive]);
  const trimmedName = name.trim();
  const sameNamePeople = trimmedName
    ? index.people.filter((entry) => entry.id !== active && entry.name.trim() === trimmedName)
    : [];
  const chosenAlbumItems = useMemo(() => mediaForFaces(items, index.faces.filter((face) => chosenSet.has(face.id))), [items, index.faces, chosenSet]);

  useEffect(() => {
    const header = heading.current;
    const navigationBottom = document.querySelector('.sidebar')?.getBoundingClientRect().bottom ?? 0;
    if (header && header.getBoundingClientRect().top < navigationBottom) header.scrollIntoView({ block: 'start' });
  }, [active, faceView]);

  function openFaceView(view: 'people' | 'all' | 'unknown', selectedPerson?: FaceIndex['people'][number]) {
    setFaceView(view);
    setActive(selectedPerson?.id ?? null);
    setName(selectedPerson?.name ?? '');
    setEditingName(Boolean(selectedPerson && !selectedPerson.name.trim()));
    setNameMode('new');
    setChosen([]);
    setTarget('');
    setSelecting(false);
    setPhotoSelecting(false);
    setAssignment(null);
    setChoosingCover(false);
    setFacePage(0);
    setPeopleSelecting(false);setSelectedPeople([]);
    setSelectingUnknown(false);
    setUnknownChosen([]);
    setExporting(false);
    setManualPhotos(false);
  }

  function openManualPhotos() { manualTarget.current = person?.id ?? null; setManualPhotos(true); }

  async function saveName() {
    if (!person || !trimmedName || blocked || locked.current) return;
    if (sameNamePeople.length) {
      if (!window.confirm(`같은 이름의 '${trimmedName}' 인물이 있습니다. ${sameNamePeople.length + 1}명의 얼굴 정보를 하나로 합칠까요? 원본 사진은 유지됩니다.`)) return;
      const destination = sameNamePeople[0];
      const sources = new Set([person.id, ...sameNamePeople.slice(1).map((entry) => entry.id)]);
      const ids = index.faces.filter((face) => sources.has(face.person_id)).map((face) => face.id);
      const saved = await edit(async () => {
        if (!ids.length || index.people.some(entry => sources.has(entry.id) && entry.media_ids?.length)) await mergeRegisteredPeople([...sources], destination.id);
        else await moveFaces(ids, destination.id);
        if (alive.current) { setActive(destination.id); setName(destination.name); setFacePage(0); }
      });
      if (saved && alive.current) setEditingName(false);
    } else {
      const saved = await edit(() => renamePerson(person.id, trimmedName));
      if (saved && alive.current) setEditingName(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    if (desktop) {
      loadFaceIndex().then((next) => { if (!disposed) setIndex(next); })
        .catch(() => { if (!disposed) setError('인물 정보를 불러오지 못했습니다.'); })
        .finally(() => { if (!disposed) setLoading(false); });
    } else setLoading(false);
    return () => { disposed = true; alive.current = false; stop.current = true; controller.current?.abort(); if (desktop) void controlPersonJobs(false).catch(() => undefined); };
  }, [desktop, items]);

  async function start(retryEmpty = false) {
    if (locked.current || !desktop) return;
    locked.current = true; stop.current = false; controller.current = new AbortController();
    setRunning(true); setError(''); setStatus('얼굴 분석 준비 중');
    setProgress({ done: 0, total: remaining.length });
    let failures = 0;
    let toScan = remaining;
    try {
      const signal=controller.current.signal;
      if (retryEmpty) {
        const retryIds = new Set(await retryEmptyFaceScans());
        toScan = photos.filter(item => retryIds.has(Number(item.id)) || !lookup.scanned.has(Number(item.id)));
        setIndex(await loadFaceIndex());
        setProgress({ done: 0, total: toScan.length });
      }
      await auditPersonSources(signal,true,()=>{});
      signal.throwIfAborted();
      await enqueuePersonPhotos(toScan);
      signal.throwIfAborted();
      await controlPersonJobs(true);
      signal.throwIfAborted();
      await loadFaceEngine(controller.current.signal);
      let done = 0;
      for (const item of toScan) {
        if (stop.current) break;
        if (alive.current) setStatus('사진에서 사람을 찾는 중');
        try { await scanPhoto(item, controller.current.signal); await finishPersonJob(Number(item.id),false); }
        catch { if (stop.current) break; failures += 1; await finishPersonJob(Number(item.id),true); }
        done += 1;
        if (alive.current) setProgress({ done, total: toScan.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive.current) {
        const next = await loadFaceIndex();
        setIndex(next);
        setStatus(stop.current ? '사람 찾기를 중단했습니다. 확인한 사진은 그대로 남아 있습니다.' : failures ? `얼굴 찾기를 마쳤습니다. ${toScan.length}장 중 ${done - failures}장을 확인했습니다. ${failures}장은 확인하지 못했습니다. 새 사진에서 사람 찾기를 눌러 다시 시도할 수 있습니다.` : `사진 ${done}장을 확인했습니다. 찾은 얼굴은 아래에 보여요. 미확인 인물의 사진을 눌러 이름을 붙여 주세요.`);
      }
    } catch { if (alive.current && !stop.current) setError('사진에서 사람을 찾는 중 문제가 발생했습니다. 이미 확인한 사진과 원본은 그대로 남아 있습니다. 다시 시도해 주세요.'); }
    finally { if(stop.current) await controlPersonJobs(false).catch(()=>undefined); controller.current = null; locked.current = false; if (alive.current) { setRunning(false); if(stop.current) setStatus('사람 찾기를 중단했습니다. 확인한 사진은 그대로 남아 있습니다.'); } }
  }

  async function edit(action: () => Promise<unknown>) {
    if (locked.current) return false;
    locked.current = true; setSaving(true); setError('');
    try {
      await action();
      if (alive.current) {setChosen([]);setTarget('');}
      try {const next=await loadFaceIndex();if(alive.current)setIndex(next);}
      catch {if(alive.current)setError('저장은 완료했지만 목록을 갱신하지 못했습니다. 인물 메뉴를 다시 열어 주세요.');}
      return true;
    } catch { if (alive.current) setError('변경 사항을 저장하지 못했습니다. 입력한 내용은 화면에 남아 있습니다. 다시 저장해 주세요.'); return false; }
    finally { locked.current = false; if (alive.current) setSaving(false); }
  }

  return <section className="peopleView">
    <div className="panelHeader entityHeader" ref={heading}>
      <div className="entityHeading">
        {(person || showFaceThumbnails) && <button className="entityBack" aria-label={selecting || photoSelecting ? '선택 취소' : choosingCover ? '대표 사진 선택 취소' : person ? '인물 목록' : '인물별 보기'} title={selecting || photoSelecting ? '선택 취소' : choosingCover ? '대표 사진 선택 취소' : person ? '인물 목록' : '인물별 보기'} disabled={blocked} onClick={() => {if(selecting || photoSelecting || choosingCover){setSelecting(false);setPhotoSelecting(false);setChoosingCover(false);setChosen([]);}else openFaceView('people');}}>{selecting || photoSelecting || choosingCover ? <X size={20}/> : <ArrowLeft size={20} />}</button>}
        <div className="entityHeadingCopy"><h2>{showUnknownFaces ? '미확인 인물' : allFaces ? '찾은 얼굴' : person ? person.name.trim() || '미확인 인물' : '인물'}</h2>
          {person && <span>사진 {personItems.length}장</span>}
          {showFaceThumbnails && <span>{faces.length}개 얼굴</span>}
        </div>
      </div>
      <div className="peopleActions entityActions">
        {person ? <>
          <button className="primaryControl entityPrimary" aria-label="선택" disabled={blocked || !personItems.length} onClick={() => { setPhotoSelecting(!photoSelecting); setSelecting(false); setChosen([]); setChoosingCover(false); }}><Check size={18} /><span>선택</span></button>
          <ActionMenu label="인물 관리" triggerText="더보기" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
            { label: '사진 내보내기', icon: <FolderOutput size={16} />, disabled: !personItems.length, onSelect: () => setExporting(true) },
            { label: '대표 사진 변경', icon: <ImageIcon size={16} />, disabled: !personItems.length, onSelect: () => { setChoosingCover(true); setSelecting(false); setPhotoSelecting(false); setChosen([]); } },
            { label: '얼굴 선택', icon: <Scissors size={16} />, disabled: !personFaces.length, onSelect: () => { setSelecting(true); setPhotoSelecting(false); setChoosingCover(false); setChosen([]); } },
            { label: '앨범 만들기', icon: <BookPlus size={16} />, disabled: !personItems.length, onSelect: () => onCreateAlbum(personItems) },
            { label: '인물 등록 삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => {
              if (window.confirm(`‘${person.name.trim() || '미확인 인물'}’의 이름과 직접 연결한 사진 정보를 삭제할까요? 얼굴은 미확인 인물로 남고 원본 사진은 유지됩니다.`)) void edit(async () => { await removePersonRegistration(person.id); openFaceView('people'); });
            } },
          ]} />
        </> : <>

        {showFaceThumbnails ? <button className="primaryControl" disabled={blocked || !faces.length} onClick={() => { setSelecting(!selecting); setChosen([]); }}>선택</button> : <button className="primaryControl entityPrimary" disabled={blocked || !desktop} onClick={openManualPhotos}><ImagePlus size={18} />인물 추가</button>}
        <ActionMenu label="얼굴 관리" triggerText="더보기" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
          { label: '찾은 얼굴 모두 보기', icon: <Users size={16} />, onSelect: () => openFaceView('all') },
          { label: '얼굴 선택하기', icon: <Check size={16} />, disabled: !index.faces.length, onSelect: () => { if (!showUnknownFaces && !allFaces) openFaceView('all'); setSelecting(true); } },
          { label: '못 찾은 사진 다시 찾기', icon: <RefreshCw size={16} />, disabled: !desktop || !scannedWithoutFaces.length, onSelect: () => void start(true) },
          { label: '인물 자동 분류 초기화', icon: <Trash2 size={16} />, danger: true, disabled: !desktop || !index.scanned.length, onSelect: () => {
            if (window.confirm('얼굴 분석 정보와 자동 분류를 지울까요? 직접 연결한 사진과 원본은 유지됩니다.')) void edit(async () => { await clearFaceIndex(); openFaceView('people'); setLastExcluded([]); });
          } },
        ]} />
        </>}
      </div>
    </div>
    {!desktop && <p role="status">얼굴 찾기는 감자싹 앱에서 사용할 수 있습니다.</p>}
    {desktop && <div className="entityQuickActions">
      {person ? <><button disabled={blocked} onClick={openManualPhotos}><ImagePlus size={18} />사진 연결</button><button disabled={blocked} onClick={() => { setName(person.name); setNameMode('new'); setEditingName(true); }}><Pencil size={18} />{person.name.trim() ? '이름 변경' : '이름 지정'}</button></> : <>
      {!showFaceThumbnails && <button disabled={blocked || !matchingPeople.length} onClick={()=>{setPeopleSelecting(!peopleSelecting);setSelectedPeople([]);setSelectingUnknown(false);setUnknownChosen([]);}}>선택</button>}
      <button className={showUnknownFaces ? 'active' : ''} disabled={blocked} onClick={() => openFaceView('unknown')}>미확인 인물 · {unidentifiedFaces.length}</button>
      {!showFaceThumbnails && <button disabled={blocked || (!remaining.length && !scannedWithoutFaces.length)} onClick={() => void start(retryOnly)}><Play size={18} />{findLabel}</button>}
      <button disabled={blocked || !unidentifiedFaces.length || !index.people.some(entry => entry.name.trim())} onClick={() => setReviewing(true)}><RefreshCw size={18} />미확인 인물 다시 확인</button>
      </>}
    </div>}
    {!person && !showFaceThumbnails && <label className="entitySort">정렬<select aria-label="인물 정렬" value={sort} onChange={event => setSort(event.target.value)}><option value="name">이름순</option><option value="photos">사진 많은 순</option></select></label>}
    {person && (selecting || photoSelecting) && <p className="entitySelectionHint">{selecting ? '얼굴을 선택합니다. 표시된 얼굴만 변경하며 같은 사진의 다른 인물은 유지됩니다.' : '사진을 선택합니다. 이 인물과의 연결만 변경합니다. 얼굴 하나만 바꾸려면 더보기의 ‘얼굴 선택’을 사용하세요.'}</p>}
    {loading && <p role="status"><LoaderCircle size={18} className="spinIcon" />인물 불러오는 중</p>}
    {(running || status) && <div className="faceProgress" role="status"><span>{status}</span>{running && <><span>{progress.done} / {progress.total}장</span><div className="peopleActions"><button onClick={() => { stop.current = true; controller.current?.abort(); void controlPersonJobs(false).catch(() => undefined); setStatus('분석을 중단하는 중'); }}><Pause size={18} />중단</button></div><progress value={progress.done} max={progress.total || 1} /></>}</div>}
    {error && !editingName && <p role="alert" className="faceError">{error}</p>}
    {import.meta.env.DEV && validating && <><PersonEvaluationPanel photos={photos} index={index} disabled={running||saving||loading||benchmarkBusy||auditBusy} onBusy={setEvaluationBusy}/><PersonDeviceBenchmarkPanel photos={photos} disabled={running||saving||loading||evaluationBusy||auditBusy} onBusy={setBenchmarkBusy}/><PersonSourceAuditPanel photos={photos} disabled={running||saving||loading||evaluationBusy||benchmarkBusy} onBusy={setAuditBusy}/></>}
    {lastExcluded.length > 0 && <div className="peopleActions"><span>{lastExcluded.length}개 얼굴 제외됨</span><button disabled={blocked} onClick={() => void edit(async () => { await setFacesExcluded(lastExcluded, false); setLastExcluded([]); })}>제외 되돌리기</button></div>}
    {!person && !showFaceThumbnails ? <>
      <div className="peopleSummary">등록된 인물 {index.people.filter(entry => entry.name.trim()).length}명 · 확인한 사진 {photos.length - remaining.length} / {photos.length}장</div>
      {!loading && !index.people.length && <EmptyState icon={<Users size={30} />} title={index.scanned.length ? '아직 찾은 얼굴이 없습니다.' : '아직 등록된 사람이 없습니다.'} description="사진 속 얼굴을 찾아 사람별로 사진을 모아볼 수 있습니다." actionLabel={remaining.length && desktop ? '사진에서 사람 찾기' : undefined} onAction={remaining.length && desktop ? () => void start() : undefined} actionIcon={<Play size={18} />} />}
      {personGroups.map((group) => {
        const pages = Math.max(1, Math.ceil(group.people.length / 24));
        const page = Math.min(group.page, pages - 1);
        return <section key={group.title} aria-label={group.title}>
        <div className="panelHeader"><h3>{group.title} <span>({group.people.length})</span></h3>
        {group.title === '미확인 인물' && <div className="peopleActions">
          <button disabled={blocked} onClick={() => { setPeopleSelecting(false);setSelectedPeople([]);setSelectingUnknown(!selectingUnknown); setUnknownChosen([]); }}><Check size={18} />{selectingUnknown ? '선택 취소' : '미확인 인물 선택'}</button>
          {selectingUnknown && <><button disabled={blocked || !unknownFaceIds.length} onClick={() => setAssignment('groups')}>이름 지정</button><span>{unknownFaceIds.length}개 얼굴 선택</span><button disabled={blocked || !unknownFaceIds.length} onClick={() => {
            if (window.confirm(`선택한 미확인 인물의 얼굴 ${unknownFaceIds.length}개를 모두 제외할까요? 원본 사진은 유지됩니다.`)) void edit(async () => {
              await setFacesExcluded(unknownFaceIds, true); setLastExcluded(unknownFaceIds); setUnknownChosen([]);
            });
          }}><X size={18} />선택한 얼굴 제외</button></>}
        </div>}</div>
        {!loading && !group.people.length && <p>{query ? '검색한 이름의 인물이 없습니다.' : group.title === '등록된 인물' ? '이름을 등록한 인물이 없습니다.' : '이름을 붙일 사람이 없습니다.'}</p>}
        {group.title === '미확인 인물' && group.people.length > 0 && <p className="peopleSectionHint">미확인 인물을 열어 이름을 지정하거나, 미확인 얼굴을 선택해 함께 이름을 지정하세요.</p>}
      <div className="personGrid" {...peopleDrag}>{group.people.slice(page * 24, (page + 1) * 24).map((entry) => {
        const members = lookup.byPerson.get(entry.id) ?? EMPTY_FACES;
        const selectable = peopleSelecting || !entry.name.trim() && selectingUnknown;
        const selection = peopleSelecting ? selectedPeople : unknownChosen;
        const cover = members.find((face) => face.id === entry.cover_face_id) ?? members[0];
        return <button className="personTile" key={entry.id} data-selection-id={entry.id} data-cover-face-id={cover?.id} data-cover-media-id={entry.cover_media_id} disabled={selectable && blocked} aria-pressed={selectable ? selection.includes(entry.id) : undefined} onClick={() => {
          if (selectable) { if(peopleSelecting){setSelectedPeople(current=>current.includes(entry.id)?current.filter(id=>id!==entry.id):[...current,entry.id]);return;} setUnknownChosen((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]); return; }
          openFaceView('people', entry);
        }}>
          {selectable && <span className={`faceCheck ${selection.includes(entry.id) ? 'checked' : ''}`} aria-hidden="true">{selection.includes(entry.id) && <Check size={22} strokeWidth={3} />}</span>}
          {entry.cover_media_id && mediaById.has(entry.cover_media_id) ? <MediaVisual item={mediaById.get(entry.cover_media_id)!} /> : cover ? <img src={cover.thumbnail} alt="" loading="lazy" /> : mediaById.get(entry.media_ids?.[0] ?? -1) ? <MediaVisual item={mediaById.get(entry.media_ids![0])!} /> : <div className="personPlaceholder"><Users size={36} /></div>}
          <strong>{entry.name.trim() || '미확인 인물'}</strong><span>{new Set([...members.map((face) => face.media_id), ...entry.media_ids ?? []]).size}장</span>
        </button>;
      })}</div>
      {pages > 1 && <div className="peopleActions"><button disabled={page === 0} onClick={() => group.setPage(page - 1)}>이전</button><span>{page + 1} / {pages}</span><button disabled={page === pages - 1} onClick={() => group.setPage(page + 1)}>다음</button></div>}
      </section>;
      })}
    </> : <div className={`personDetailShell${showDirectory ? '' : ' overview'}`}>
      {showDirectory && <aside className="personDirectory" aria-label="이름을 지정한 사람">
        <h3>이름을 지정한 사람</h3>
        {matchingPeople.filter((entry) => entry.name.trim()).map((entry) => {
          const members = lookup.byPerson.get(entry.id) ?? EMPTY_FACES;
          const cover = members.find((face) => face.id === entry.cover_face_id) ?? members[0];
          return <button key={entry.id} className={entry.id === active ? 'active' : ''} aria-pressed={entry.id === active} onClick={() => openFaceView('people', entry)}>
            {entry.cover_media_id && mediaById.has(entry.cover_media_id) ? <MediaVisual item={mediaById.get(entry.cover_media_id)!} /> : cover ? <img src={cover.thumbnail} alt="" loading="lazy" /> : mediaById.get(entry.media_ids?.[0] ?? -1) ? <MediaVisual item={mediaById.get(entry.media_ids![0])!} /> : <div className="personPlaceholder"><Users size={22} /></div>}
            <span><strong>{entry.name}</strong><small>사진 {new Set([...members.map((face) => face.media_id), ...entry.media_ids ?? []]).size}장</small></span>
          </button>;
        })}
        <button className={`unknownDirectory${showUnknownFaces ? ' active' : ''}`} aria-pressed={showUnknownFaces} onClick={() => openFaceView('unknown')}><span><strong>미확인 인물</strong><small>{unidentifiedFaces.length}개 얼굴</small></span></button>
      </aside>}
      <div className="personDetailContent">
      {choosingCover && <div className="peopleActions"><span>대표로 사용할 사진을 고르세요.</span><button onClick={() => setChoosingCover(false)}>대표 사진 선택 취소</button></div>}
      {!(showManualPhotos ? personItems.length : faces.length) && <div className="emptyState"><Users size={30} /><p>{showUnknownFaces ? '이름을 붙일 사람이 없습니다.' : person && !selecting && !choosingCover ? '아직 연결한 사진이 없습니다. 사진 연결에서 선택해 주세요.' : '표시할 얼굴이 없습니다.'}</p></div>}
      <div className={`personPhotoGrid${showFaceThumbnails ? ' faceOverviewGrid' : person ? ' personMediaGrid' : ''}${selecting || photoSelecting ? ' selecting' : ''}`} {...dragSelection}>{showManualPhotos ? personItems.slice(currentFacePage * 24, (currentFacePage + 1) * 24).map(item => <article key={item.id} className="personPhoto" data-selection-id={item.id}><button className="personOriginal" disabled={blocked} aria-label={choosingCover ? '대표 사진으로 설정' : photoSelecting ? '사진 선택' : '사진 상세보기'} aria-pressed={photoSelecting ? chosen.includes(Number(item.id)) : undefined} onClick={() => {
        if (choosingCover && person) void edit(() => setPersonCoverPhoto(person.id, Number(item.id))).then(saved => { if(saved) setChoosingCover(false); });
        else if (photoSelecting) toggleFace(item.id);
        else onOpen(item, personItems);
      }}><MediaVisual item={item} /></button>{photoSelecting && <span className={`faceCheck ${chosen.includes(Number(item.id)) ? 'checked' : ''}`} aria-hidden="true">{chosen.includes(Number(item.id)) && <Check size={22} />}</span>}{(person?.cover_media_id === Number(item.id) || !person?.cover_media_id && personFaces.find(face=>face.id===person?.cover_face_id)?.media_id===Number(item.id)) && <span className="personCoverBadge">대표</span>}<div className="personPhotoMeta"><span>{item.takenAt ?? '날짜 없음'}</span>{!automaticIds.includes(Number(item.id)) && <span>직접 연결</span>}</div></article>) : faces.slice(currentFacePage * 24, (currentFacePage + 1) * 24).map((face) => {
        const item = mediaById.get(face.media_id);
        return <article key={face.id} className="personPhoto" data-selection-id={face.id}>
          <button className="personOriginal" disabled={choosingCover ? blocked : selecting ? blocked : !item} onClick={() => {
            if (choosingCover && person) { void edit(() => setPersonCoverFace(person.id, face.id)).then(saved => { if (saved && alive.current) setChoosingCover(false); }); }
            else if (selecting) toggleFace(String(face.id));
            else if (item) onOpen(item, faceItems);
          }} aria-label={choosingCover ? '대표 사진으로 설정' : selecting ? '얼굴 선택' : '사진 상세보기'} aria-pressed={choosingCover ? person?.cover_face_id === face.id : selecting ? chosen.includes(face.id) : undefined}>
            {!showFaceThumbnails && item ? <MediaVisual item={item} /> : <img src={face.thumbnail} alt="" loading="lazy" decoding="async" draggable={false} />}
            {showFaceThumbnails && item && <FavoriteBadge item={item} />}{selecting && !showFaceThumbnails && <img className="personFaceIdentity" src={face.thumbnail} alt="선택할 얼굴" />}
          </button>
          {person?.cover_face_id === face.id && <span className="personCoverBadge">대표</span>}
          {selecting && <span className={`faceCheck ${chosen.includes(face.id) ? 'checked' : ''}`} aria-hidden="true">{chosen.includes(face.id) && <Check size={22} strokeWidth={3} />}</span>}
          <div className="personPhotoMeta">{showFaceThumbnails && <img src={face.thumbnail} alt="분류된 얼굴" />}<span>{item?.takenAt ?? '날짜 없음'}</span>{face.confirmed && <span>확인</span>}</div>
        </article>;
      })}</div>
      {facePages > 1 && <div className="peopleActions"><button disabled={currentFacePage === 0} onClick={() => setFacePage(currentFacePage - 1)}>이전</button><span>{currentFacePage + 1} / {facePages}</span><button disabled={currentFacePage === facePages - 1} onClick={() => setFacePage(currentFacePage + 1)}>다음</button></div>}
      {selecting && <EntitySelectionBar count={chosen.length} unit="얼굴" busy={blocked} onAll={() => setChosen(faces.map(face => face.id))} onClear={() => setChosen([])} onClose={() => { setSelecting(false); setChosen([]); }}>
        <button className="primaryControl" disabled={blocked || !chosen.length} onClick={() => setAssignment('faces')}>{person?.name.trim() ? '다른 인물로 변경' : '이름 지정'}</button>

        <button disabled={blocked || !chosen.length} onClick={() => void edit(() => assignPersonFaces(chosen,{target:null,name:null}))}>미확인 상태로 변경</button>
        <button disabled={blocked || !chosen.length} onClick={() => { if(window.confirm(`선택한 얼굴 ${chosen.length}개를 인물 분류에서 제외할까요? 원본 사진과 같은 사진의 다른 인물은 유지됩니다.`)) void edit(async()=>{await setFacesExcluded(chosen,true);setLastExcluded(chosen);}); }}>얼굴 제외</button>
        {person && <ActionMenu label="선택한 얼굴 더보기" triggerText="더보기" icon={<MoreVertical size={18}/>} disabled={blocked || !chosen.length} actions={[
          {label:'이 인물로 확인',disabled:!person.name.trim(),onSelect:()=>void edit(()=>moveFaces(chosen,person.id))},
          {label:'선택한 사진으로 앨범 만들기',disabled:!chosenAlbumItems.length,onSelect:()=>onCreateAlbum(chosenAlbumItems)},
        ]}/>}
      </EntitySelectionBar>}
      {photoSelecting && person && <EntitySelectionBar count={chosen.length} unit="사진" busy={blocked} onAll={() => setChosen(personItems.map(item => Number(item.id)))} onClear={() => setChosen([])} onClose={() => { setPhotoSelecting(false); setChosen([]); }}>
        <button className="primaryControl" disabled={blocked || !chosen.length} onClick={() => setAssignment('photos')}>다른 인물로 변경</button>
        <button disabled={blocked || !chosen.length} onClick={() => void edit(() => editEntityPhotos('person',person.id,chosen,'unknown'))}>미확인 상태로 변경</button>
        <button disabled={blocked || !chosen.length} onClick={() => { if(window.confirm(`사진 ${chosen.length}장의 이 인물 연결만 제외할까요? 같은 사진의 다른 인물과 원본 사진은 유지됩니다.`)) void edit(() => editEntityPhotos('person',person.id,chosen,'exclude')); }}>이 인물에서 제외</button>
      </EntitySelectionBar>}
      </div>
    </div>}
    {peopleSelecting && <EntitySelectionBar count={selectedPeople.length} unit="인물" busy={blocked} onAll={()=>setSelectedPeople(matchingPeople.map(entry=>entry.id))} onClear={()=>setSelectedPeople([])} onClose={()=>{setPeopleSelecting(false);setSelectedPeople([]);}}>
      <button disabled={blocked || !selectedPeople.length} onClick={()=>{if(window.confirm(`인물 ${selectedPeople.length}명의 이름과 직접 연결한 사진 정보를 삭제할까요? 얼굴은 미확인 상태로 남고 원본 사진은 유지됩니다.`)) void edit(()=>removeEntityRegistrations('person',selectedPeople)).then(saved=>{if(saved){setSelectedPeople([]);setPeopleSelecting(false);}});}}>인물 등록 삭제</button>
    </EntitySelectionBar>}
    {assignment && <EntityAssignmentDialog kind="person" entries={index.people.filter(entry => entry.name.trim() && entry.id !== active)} count={assignment === 'groups' ? unknownFaceIds.length : chosen.length} unit={assignment === 'photos' ? '사진' : '얼굴'} onClose={() => setAssignment(null)} onSave={async value => {
      const ids=assignment === 'groups' ? unknownFaceIds : chosen;
      const saved=await edit(() => assignment === 'photos' && person ? editEntityPhotos('person',person.id,ids,'move',value) : assignPersonFaces(ids,value));
      if(!saved) throw new Error('이름을 지정하지 못했습니다.');
      setUnknownChosen([]); setStatus('선택한 대상에 이름을 지정했습니다.');
    }} />}
    {person && editingName && <EntityEditorDialog title={person.name.trim() ? '이름 변경' : '이름 지정'} busy={blocked} className="personEditor" onClose={() => { setName(person.name); setTarget(''); setEditingName(false); }}>
      <form onSubmit={event => { event.preventDefault(); if (nameMode === 'existing') { const destination = lookup.peopleById.get(Number(target)); if (destination?.name.trim()) void edit(() => person.media_ids?.length || !personFaces.length ? mergeRegisteredPeople([person.id], destination.id) : moveFaces(personFaces.map(face => face.id), destination.id)).then(saved => { if (saved && alive.current) { openFaceView('people', destination); setStatus(`${destination.name}의 사진으로 저장했습니다.`); } }); } else void saveName(); }}>
        <div className="entityEditBody">
          <div className="entityEditIdentity">{personFaces.length ? <img src={(personFaces.find(face => face.id === person.cover_face_id) ?? personFaces[0]).thumbnail} alt="" /> : personItems[0] ? <MediaVisual item={personItems[0]} /> : <Users size={32} />}<div><strong>{person.name.trim() || '미확인 인물'}</strong><small>사진 {personItems.length}장</small></div></div>
          {!person.name.trim() && index.people.some(entry => entry.name.trim()) && <div className="entityEditModes" aria-label="이름 등록 방법"><button type="button" aria-pressed={nameMode === 'new'} disabled={blocked} onClick={() => setNameMode('new')}>새 이름 입력</button><button type="button" aria-pressed={nameMode === 'existing'} disabled={blocked} onClick={() => setNameMode('existing')}>등록한 사람 선택</button></div>}
          {nameMode === 'new' ? <label className="entityEditField">이름<input aria-label="인물 이름" placeholder="이름을 입력하세요" maxLength={80} value={name} disabled={blocked} onChange={event => setName(event.target.value)} /></label> : <label className="entityEditField">이미 등록한 사람<select aria-label="이미 등록한 사람" value={target} disabled={blocked} onChange={event => setTarget(event.target.value)}><option value="">사람 선택</option>{index.people.filter(entry => entry.name.trim() && entry.id !== person.id).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
          {nameMode === 'existing' && <p>선택한 사람의 사진으로 함께 모아집니다.</p>}
          {error && <p role="alert" className="entityEditError">{error}</p>}
        </div>
        <footer className="peopleActions entityEditFooter"><button type="button" disabled={blocked} onClick={() => { setName(person.name); setTarget(''); setEditingName(false); }}>취소</button><button type="submit" className="primaryControl" disabled={blocked || (nameMode === 'existing' ? !target || !personItems.length && !personFaces.length : !trimmedName || !sameNamePeople.length && trimmedName === person.name)}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}{nameMode === 'existing' ? '이 사람으로 저장' : sameNamePeople.length ? '같은 이름 합치기' : '이름 저장'}</button></footer>
      </form>
    </EntityEditorDialog>}
    {reviewing && <FaceMatchReview index={index} onClose={() => setReviewing(false)} onSaved={async () => { setIndex(await loadFaceIndex()); setChosen([]); }} />}
    {exporting && person && <ExportModal title={person.name.trim() || `미확인 인물 ${person.id}`} items={personItems} onClose={() => setExporting(false)} />}
    {manualPhotos && <EntityPhotoPicker title={person ? '사진 연결' : '인물 추가'} name={person?.name} photos={photos} initialIds={person?.media_ids} automaticIds={automaticIds} onClose={() => setManualPhotos(false)} onSave={async (draft, ids) => {
      if (!person && manualTarget.current !== null) await renamePerson(manualTarget.current, draft);
      const id = await saveManualPersonPhotos(manualTarget.current, draft, ids); manualTarget.current = id;
      const next = await loadFaceIndex(); setIndex(next); openFaceView('people', next.people.find(entry => entry.id === id));
    }} />}
  </section>;
}
