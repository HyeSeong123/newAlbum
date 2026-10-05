import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookPlus, Check, FolderOutput, Image as ImageIcon, LoaderCircle, MoreVertical, Pause, Pencil, Play, RefreshCw, Scissors, Trash2, Users, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { clearFaceIndex, emptyFaceIndex, FaceIndex, loadFaceEngine, loadFaceIndex, moveFaces, renamePerson, scanPhoto, setFacesExcluded, setPersonCoverFace } from './faceService';
import { EmptyState, FavoriteBadge, MediaVisual } from '../../components/MediaVisual';
import { useRowSelection } from '../../hooks/useRowSelection';
import './people.css';
import { FaceMatchReview } from './FaceMatchReview';
import { ExportModal } from '../../components/ExportModal';
import { ActionMenu } from '../../components/ActionMenu';
import { EMPTY_FACES, indexFaces, mediaForFaces } from './peopleModel';

export function PeopleView({ items, onOpen, onCreateAlbum, query = "" }: { items: MediaItem[]; query?: string; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; onCreateAlbum: (items: MediaItem[]) => void }) {
  const [index, setIndex] = useState<FaceIndex>(emptyFaceIndex);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [faceView, setFaceView] = useState<'people' | 'all' | 'unknown'>('people');
  const [selecting, setSelecting] = useState(false);
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
  const [showUnknownGroups, setShowUnknownGroups] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [target, setTarget] = useState('');
  const [facePage, setFacePage] = useState(0);
  const [personPage, setPersonPage] = useState(0);
  const [unknownPage, setUnknownPage] = useState(0);
  const [selectingUnknown, setSelectingUnknown] = useState(false);
  const [unknownChosen, setUnknownChosen] = useState<number[]>([]);
  const alive = useRef(false);
  const stop = useRef(false);
  const locked = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
  const desktop = isTauriRuntime();
  const photos = useMemo(() => items.filter((item) => item.fileType === 'image'), [items]);
  const mediaById = useMemo(() => new Map(items.map((item) => [Number(item.id), item])), [items]);
  const lookup = useMemo(() => indexFaces(index), [index]);
  const remaining = useMemo(() => photos.filter((item) => !lookup.scanned.has(Number(item.id))), [photos, lookup]);
  const person = active === null ? undefined : lookup.peopleById.get(active);
  const allFaces = faceView === 'all';
  const showUnknownFaces = faceView === 'unknown';
  const showFaceThumbnails = allFaces || showUnknownFaces;
  const unidentifiedFaces = lookup.unidentified;
  const personFaces = active === null ? EMPTY_FACES : lookup.byPerson.get(active) ?? EMPTY_FACES;
  const faces = allFaces ? index.faces : showUnknownFaces ? unidentifiedFaces : personFaces;
  const faceItems = useMemo(() => mediaForFaces(items, faces), [items, faces]);
  const showDirectory = !allFaces && (Boolean(person) || showUnknownFaces);
  const facePages = Math.max(1, Math.ceil(faces.length / 24));
  const currentFacePage = Math.min(facePage, facePages - 1);
  const search = query.trim().toLocaleLowerCase();
  const matchingPeople = useMemo(() => index.people.filter((entry) => (entry.name.trim() || "미확인 얼굴").toLocaleLowerCase().includes(search)), [index.people, search]);
  useEffect(() => { setPersonPage(0); setUnknownPage(0); openFaceView('people'); }, [query]);
  const personGroups = [
    { title: '등록된 사람', people: matchingPeople.filter((entry) => entry.name.trim()), page: personPage, setPage: setPersonPage },
    ...(showUnknownGroups ? [{ title: '미확인 얼굴', people: matchingPeople.filter((entry) => !entry.name.trim()), page: unknownPage, setPage: setUnknownPage }] : []),
  ];
  const blocked = running || saving || loading;
  const unknownFaceIds = useMemo(() => {
    const selectedPeople = new Set(unknownChosen);
    return unidentifiedFaces.filter((face) => selectedPeople.has(face.person_id)).map((face) => face.id);
  }, [unidentifiedFaces, unknownChosen]);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const toggleFace = (id: string) => setChosen((current) => current.includes(Number(id)) ? current.filter((entry) => entry !== Number(id)) : [...current, Number(id)]);
  const dragSelection = useRowSelection(selecting && !blocked, toggleFace, (id) => chosenSet.has(Number(id)));
  const trimmedName = name.trim();
  const sameNamePeople = trimmedName
    ? index.people.filter((entry) => entry.id !== active && entry.name.trim() === trimmedName)
    : [];
  const chosenAlbumItems = useMemo(() => mediaForFaces(items, index.faces.filter((face) => chosenSet.has(face.id))), [items, index.faces, chosenSet]);
  const personItems = useMemo(() => mediaForFaces(items, personFaces), [items, personFaces]);

  useEffect(() => {
    const header = heading.current;
    const navigationBottom = document.querySelector('.sidebar')?.getBoundingClientRect().bottom ?? 0;
    if (header && header.getBoundingClientRect().top < navigationBottom) header.scrollIntoView({ block: 'start' });
  }, [active, faceView]);

  function openFaceView(view: 'people' | 'all' | 'unknown', selectedPerson?: FaceIndex['people'][number]) {
    setFaceView(view);
    setActive(selectedPerson?.id ?? null);
    setName(selectedPerson?.name ?? '');
    setEditingName(!selectedPerson?.name.trim());
    setChosen([]);
    setTarget('');
    setSelecting(false);
    setChoosingCover(false);
    setFacePage(0);
    setSelectingUnknown(false);
    setUnknownChosen([]);
    setExporting(false);
  }

  async function saveName() {
    if (!person || blocked || locked.current) return;
    if (sameNamePeople.length) {
      if (!window.confirm(`같은 이름의 '${trimmedName}' 인물이 있습니다. ${sameNamePeople.length + 1}명의 얼굴 정보를 하나로 합칠까요? 원본 사진은 유지됩니다.`)) return;
      const destination = sameNamePeople[0];
      const sources = new Set([person.id, ...sameNamePeople.slice(1).map((entry) => entry.id)]);
      const ids = index.faces.filter((face) => sources.has(face.person_id)).map((face) => face.id);
      const saved = await edit(async () => {
        await moveFaces(ids, destination.id);
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
    return () => { disposed = true; alive.current = false; stop.current = true; };
  }, [desktop, items]);

  async function start() {
    if (locked.current || !desktop) return;
    locked.current = true; stop.current = false;
    setRunning(true); setError(''); setStatus('얼굴 분석 준비 중');
    setProgress({ done: 0, total: remaining.length });
    let failures = 0;
    try {
      await loadFaceEngine();
      let done = 0;
      for (const item of remaining) {
        if (stop.current) break;
        if (alive.current) setStatus('사진에서 사람을 찾는 중');
        try { await scanPhoto(item); }
        catch { failures += 1; }
        done += 1;
        if (alive.current) setProgress({ done, total: remaining.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive.current) {
        setIndex(await loadFaceIndex());
        setStatus(stop.current ? '사람 찾기를 중단했습니다. 확인한 사진은 그대로 남아 있습니다.' : failures ? `얼굴 찾기를 마쳤습니다. ${remaining.length}장 중 ${done - failures}장을 확인했습니다. ${failures}장은 확인하지 못했습니다. 새 사진에서 사람 찾기를 눌러 다시 시도할 수 있습니다.` : `얼굴 찾기를 마쳤습니다. ${done}장을 확인했습니다.`);
      }
    } catch { if (alive.current) setError('사진에서 사람을 찾는 중 문제가 발생했습니다. 이미 확인한 사진과 원본은 그대로 남아 있습니다. 다시 시도해 주세요.'); }
    finally { locked.current = false; if (alive.current) setRunning(false); }
  }

  async function edit(action: () => Promise<unknown>) {
    if (locked.current) return false;
    locked.current = true; setSaving(true); setError('');
    try {
      await action();
      const next = await loadFaceIndex();
      if (alive.current) { setIndex(next); setChosen([]); setTarget(''); }
      return true;
    } catch { if (alive.current) setError('변경 사항을 저장하지 못했습니다. 입력한 내용은 화면에 남아 있습니다. 다시 저장해 주세요.'); return false; }
    finally { locked.current = false; if (alive.current) setSaving(false); }
  }

  return <section className="peopleView">
    <div className="panelHeader entityHeader" ref={heading}>
      <div className="entityHeading">
        {(person || showFaceThumbnails) && <button className="entityBack" aria-label={person ? '사람 목록' : '사람별 보기'} title={person ? '사람 목록' : '사람별 보기'} disabled={blocked} onClick={() => openFaceView('people')}><ArrowLeft size={20} /></button>}
        <div className="entityHeadingCopy"><h2>{showUnknownFaces ? '미확인 얼굴' : allFaces ? '모든 얼굴' : person ? person.name.trim() || '미확인 얼굴' : '사람'}</h2>
          {person && <span>사진 {personItems.length}장</span>}
          {showFaceThumbnails && <span>{faces.length}개 얼굴</span>}
        </div>
      </div>
      <div className="peopleActions entityActions">
        {person ? <>
          <button className="primaryControl entityPrimary" aria-label="앨범 만들기" disabled={blocked || !personItems.length} onClick={() => onCreateAlbum(personItems)}><BookPlus size={18} /><span className="entityActionFull">앨범 만들기</span><span className="entityActionShort" aria-hidden="true">새 앨범</span></button>
          <ActionMenu label="사람 관리" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
            { label: '이름 수정', icon: <Pencil size={16} />, onSelect: () => setEditingName(true) },
            { label: '사진 내보내기', icon: <FolderOutput size={16} />, disabled: !personItems.length, onSelect: () => setExporting(true) },
            { label: '대표 사진 변경', icon: <ImageIcon size={16} />, onSelect: () => { setChoosingCover(true); setSelecting(false); setChosen([]); } },
            { label: '얼굴 선택·분리·합치기', icon: <Scissors size={16} />, onSelect: () => { setSelecting(true); setChoosingCover(false); setChosen([]); } },
          ]} />
        </> : <>
        <div className="toolbarGroup" role="group" aria-label="얼굴 분석">
          <button className="primaryControl entityPrimary" aria-label={index.scanned.length ? '새 사진에서 사람 찾기' : '사진에서 사람 찾기'} disabled={blocked || !desktop || !remaining.length} onClick={() => void start()}><Play size={18} /><span className="entityActionFull">{index.scanned.length ? '새 사진에서 사람 찾기' : '사진에서 사람 찾기'}</span><span className="entityActionShort" aria-hidden="true">사람 찾기</span></button>
        </div>
        <ActionMenu label="얼굴 관리" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
          { label: showUnknownGroups ? '미확인 얼굴 닫기' : '미확인 얼굴 보기', icon: <Users size={16} />, disabled: !unidentifiedFaces.length, onSelect: () => { openFaceView('people'); setShowUnknownGroups(value => !value); } },
          { label: '모든 얼굴 보기', icon: <Users size={16} />, onSelect: () => openFaceView('all') },
          { label: '얼굴 선택하기', icon: <Check size={16} />, disabled: !index.faces.length, onSelect: () => { if (!showUnknownFaces && !allFaces) openFaceView('all'); setSelecting(true); } },
          { label: '미확인 얼굴 다시 비교', icon: <RefreshCw size={16} />, disabled: !desktop || !index.people.some((entry) => entry.name.trim()), onSelect: () => setReviewing(true) },
          { label: '얼굴 정보 새로고침', icon: <RefreshCw size={16} />, disabled: !desktop, onSelect: () => void edit(async () => {}) },
          { label: '얼굴 정보 초기화', icon: <Trash2 size={16} />, danger: true, disabled: !desktop || !index.scanned.length, onSelect: () => {
            if (window.confirm('인물 이름, 얼굴 분석 정보와 제외 설정을 모두 지울까요? 원본 사진은 유지됩니다.')) void edit(async () => { await clearFaceIndex(); openFaceView('people'); setLastExcluded([]); });
          } },
        ]} />
        </>}
      </div>
    </div>
    {!desktop && <p role="status">얼굴 찾기는 감자싹 데스크톱 앱에서 사용할 수 있습니다.</p>}
    {loading && <p role="status"><LoaderCircle size={18} className="spinIcon" />인물 불러오는 중</p>}
    {(running || status) && <div className="faceProgress" role="status"><span>{status}</span>{running && <><span>{progress.done} / {progress.total}장</span><div className="peopleActions"><button onClick={() => { stop.current = true; setStatus('현재 사진을 마치고 중단합니다.'); }}><Pause size={18} />중단</button></div><progress value={progress.done} max={progress.total || 1} /></>}</div>}
    {error && <p role="alert" className="faceError">{error}</p>}
    {lastExcluded.length > 0 && <div className="peopleActions"><span>{lastExcluded.length}개 얼굴 제외됨</span><button disabled={blocked} onClick={() => void edit(async () => { await setFacesExcluded(lastExcluded, false); setLastExcluded([]); })}>제외 되돌리기</button></div>}
    {!person && !showFaceThumbnails ? <>
      <div className="peopleSummary">등록된 사람 {index.people.filter(entry => entry.name.trim()).length}명 · 확인한 사진 {photos.length - remaining.length} / {photos.length}장</div>
      {!loading && !index.people.length && <EmptyState icon={<Users size={30} />} title={index.scanned.length ? '아직 찾은 얼굴이 없습니다.' : '아직 등록된 사람이 없습니다.'} description="사진 속 얼굴을 찾아 사람별로 사진을 모아볼 수 있습니다." actionLabel={remaining.length && desktop ? '사진에서 사람 찾기' : undefined} onAction={remaining.length && desktop ? () => void start() : undefined} actionIcon={<Play size={18} />} />}
      {personGroups.map((group) => {
        const pages = Math.max(1, Math.ceil(group.people.length / 24));
        const page = Math.min(group.page, pages - 1);
        return <section key={group.title} aria-label={group.title}>
        <div className="panelHeader"><h3>{group.title} <span>({group.people.length})</span></h3>
        {group.title === '미확인 얼굴' && <div className="peopleActions">
          <button disabled={blocked} onClick={() => { setSelectingUnknown(!selectingUnknown); setUnknownChosen([]); }}><Check size={18} />{selectingUnknown ? '선택 끝내기' : '미확인 얼굴 선택'}</button>
          {selectingUnknown && <><span>{unknownFaceIds.length}개 얼굴 선택</span><button disabled={blocked || !unknownFaceIds.length} onClick={() => {
            if (window.confirm(`선택한 그룹에 속한 미확인 얼굴 ${unknownFaceIds.length}개를 모두 제외할까요? 원본 사진은 유지됩니다.`)) void edit(async () => {
              await setFacesExcluded(unknownFaceIds, true); setLastExcluded(unknownFaceIds); setUnknownChosen([]);
            });
          }}><X size={18} />선택한 얼굴 제외</button></>}
        </div>}</div>
        {!loading && !group.people.length && <p>{query ? '검색한 이름의 인물이 없습니다.' : group.title === '등록된 사람' ? '이름을 등록한 인물이 없습니다.' : '미확인 얼굴이 없습니다.'}</p>}
      <div className="personGrid">{group.people.slice(page * 24, (page + 1) * 24).map((entry) => {
        const members = lookup.byPerson.get(entry.id) ?? EMPTY_FACES;
        const selectable = !entry.name.trim() && selectingUnknown;
        const cover = members.find((face) => face.id === entry.cover_face_id) ?? members[0];
        return <button className="personTile" key={entry.id} data-cover-face-id={cover?.id} disabled={selectable && blocked} aria-pressed={selectable ? unknownChosen.includes(entry.id) : undefined} onClick={() => {
          if (selectable) { setUnknownChosen((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]); return; }
          openFaceView('people', entry);
        }}>
          {selectable && <span className={`faceCheck ${unknownChosen.includes(entry.id) ? 'checked' : ''}`} aria-hidden="true">{unknownChosen.includes(entry.id) && <Check size={22} strokeWidth={3} />}</span>}
          <img src={cover?.thumbnail} alt="" loading="lazy" />
          <strong>{entry.name.trim() || '미확인 얼굴'}</strong><span>{new Set(members.map((face) => face.media_id)).size}장</span>
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
            <img src={cover?.thumbnail} alt="" loading="lazy" />
            <span><strong>{entry.name}</strong><small>사진 {new Set(members.map((face) => face.media_id)).size}장</small></span>
          </button>;
        })}
        <button className={`unknownDirectory${showUnknownFaces ? ' active' : ''}`} aria-pressed={showUnknownFaces} onClick={() => openFaceView('unknown')}><span><strong>미확인 얼굴</strong><small>{unidentifiedFaces.length}개 얼굴</small></span></button>
      </aside>}
      <div className="personDetailContent">
      {person && editingName && <div className="peopleActions personEditor">
        <form onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
          <input aria-label="인물 이름" placeholder="이름" maxLength={80} value={name} disabled={blocked} onChange={(event) => setName(event.target.value)} />
          <button disabled={blocked || (!sameNamePeople.length && trimmedName === person.name)}><Check size={18} />{sameNamePeople.length ? '같은 이름 합치기' : '이름 저장'}</button>
          <button type="button" disabled={blocked} onClick={() => { setName(person.name); setEditingName(false); }}><X size={18} />취소</button>
        </form>
      </div>}
      {choosingCover && <div className="peopleActions"><span>대표로 사용할 사진을 고르세요.</span><button onClick={() => setChoosingCover(false)}>대표 사진 선택 취소</button></div>}
      {selecting && <div className="peopleActions"><button onClick={() => { setSelecting(false); setChosen([]); }}><Check size={18} />얼굴 선택 끝내기</button></div>}
      {selecting && <div className="peopleActions faceSelectionActions">
        <span>{chosen.length}개 선택</span>
        {person && !allFaces && <button disabled={blocked || !chosenAlbumItems.length} onClick={() => onCreateAlbum(chosenAlbumItems)}><BookPlus size={18} />앨범 만들기 ({chosenAlbumItems.length})</button>}
        <button disabled={blocked || !chosen.length} onClick={() => {
          if (window.confirm(`선택한 얼굴 ${chosen.length}개를 인물 목록과 얼굴 비교에서 제외할까요? 원본 사진은 유지됩니다.`)) void edit(async () => { await setFacesExcluded(chosen, true); setLastExcluded(chosen); });
        }}><X size={18} />얼굴 제외</button>
        <button disabled={blocked || !chosen.length} onClick={() => void edit(() => moveFaces(chosen, null))}><Scissors size={18} />새 인물로 분리</button>
        <select aria-label="옮길 인물" disabled={blocked} value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">옮길 인물</option>{index.people.filter((entry) => entry.id !== active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name.trim() || `미확인 얼굴 ${entry.id}`}</option>)}
        </select>
        <button disabled={blocked || !chosen.length || !target} onClick={() => void edit(() => moveFaces(chosen, Number(target)))}><Users size={18} />옮기기</button>
        <button title="선택 해제" disabled={!chosen.length} onClick={() => setChosen([])}><X size={18} />선택 해제</button>
      </div>}
      {!faces.length && <div className="emptyState"><Users size={30} /><p>{showUnknownFaces ? '미확인 얼굴이 없습니다.' : '표시할 얼굴이 없습니다.'}</p></div>}
      <div className={`personPhotoGrid${showFaceThumbnails ? ' faceOverviewGrid' : person ? ' personMediaGrid' : ''}${selecting ? ' selecting' : ''}`} {...dragSelection}>{faces.slice(currentFacePage * 24, (currentFacePage + 1) * 24).map((face) => {
        const item = mediaById.get(face.media_id);
        return <article key={face.id} className="personPhoto" data-selection-id={face.id}>
          <button className="personOriginal" disabled={choosingCover ? blocked : selecting ? blocked : !item} onClick={() => {
            if (choosingCover && person) { void edit(() => setPersonCoverFace(person.id, face.id)).then(saved => { if (saved && alive.current) setChoosingCover(false); }); }
            else if (selecting) toggleFace(String(face.id));
            else if (item) onOpen(item, faceItems);
          }} aria-label={choosingCover ? '대표 사진으로 설정' : selecting ? '얼굴 선택' : '사진 상세보기'} aria-pressed={choosingCover ? person?.cover_face_id === face.id : selecting ? chosen.includes(face.id) : undefined}>
            {!showFaceThumbnails && item ? <MediaVisual item={item} /> : <img src={face.thumbnail} alt="" loading="lazy" decoding="async" draggable={false} />}
            {showFaceThumbnails && item && <FavoriteBadge item={item} />}
          </button>
          {person?.cover_face_id === face.id && <span className="personCoverBadge">대표</span>}
          {selecting && <span className={`faceCheck ${chosen.includes(face.id) ? 'checked' : ''}`} aria-hidden="true">{chosen.includes(face.id) && <Check size={22} strokeWidth={3} />}</span>}
          <div className="personPhotoMeta">{showFaceThumbnails && <img src={face.thumbnail} alt="분류된 얼굴" />}<span>{item?.takenAt ?? '날짜 없음'}</span></div>
        </article>;
      })}</div>
      {facePages > 1 && <div className="peopleActions"><button disabled={currentFacePage === 0} onClick={() => setFacePage(currentFacePage - 1)}>이전</button><span>{currentFacePage + 1} / {facePages}</span><button disabled={currentFacePage === facePages - 1} onClick={() => setFacePage(currentFacePage + 1)}>다음</button></div>}
      </div>
    </div>}
    {reviewing && <FaceMatchReview index={index} onClose={() => setReviewing(false)} onSaved={async () => { setIndex(await loadFaceIndex()); setChosen([]); }} />}
    {exporting && person && <ExportModal title={person.name.trim() || `미확인 얼굴 ${person.id}`} items={personItems} onClose={() => setExporting(false)} />}
  </section>;
}
