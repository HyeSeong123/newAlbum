import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookPlus, Check, FolderOutput, Image as ImageIcon, ImagePlus, LoaderCircle, MoreVertical, Pencil, Scissors, Trash2, Users, X } from 'lucide-react';
import type { MediaItem } from '../../types/media';
import { isTauriRuntime } from '../../services/tauriMediaService';
import { clearFaceIndex, emptyFaceIndex, FaceIndex, loadFaceIndex, moveFaces, renamePerson, setFacesExcluded, setPersonCoverFace, saveManualPersonPhotos, mergeRegisteredPeople } from './faceStorage';
import { EmptyState, FavoriteBadge, MediaVisual } from '../../components/MediaVisual';
import { useRowSelection } from '../../hooks/useRowSelection';
import './people.css';
import { ExportModal } from '../../components/ExportModal';
import { ActionMenu } from '../../components/ActionMenu';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import { EMPTY_FACES, indexFaces, mediaForFaces } from './peopleModel';
import { EntityPhotoPicker } from '../../components/EntityPhotoPicker';

export function PeopleView({ items, onOpen, onCreateAlbum, query = "" }: { items: MediaItem[]; query?: string; onOpen: (item: MediaItem, collection?: MediaItem[]) => void; onCreateAlbum: (items: MediaItem[]) => void }) {
  const [index, setIndex] = useState<FaceIndex>(emptyFaceIndex);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [faceView, setFaceView] = useState<'people' | 'all' | 'unknown'>('people');
  const [selecting, setSelecting] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [lastExcluded, setLastExcluded] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [manualPhotos, setManualPhotos] = useState(false);
  const manualTarget = useRef<number | null>(null);
  const [nameMode, setNameMode] = useState<'new' | 'existing'>('new');
  const [faceAction, setFaceAction] = useState('move');
  const [chosen, setChosen] = useState<number[]>([]);
  const [target, setTarget] = useState('');
  const [facePage, setFacePage] = useState(0);
  const [personPage, setPersonPage] = useState(0);
  const [unknownPage, setUnknownPage] = useState(0);
  const [selectingUnknown, setSelectingUnknown] = useState(false);
  const [unknownChosen, setUnknownChosen] = useState<number[]>([]);
  const alive = useRef(false);
  const locked = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
  const desktop = isTauriRuntime();
  const photos = useMemo(() => items.filter((item) => item.fileType === 'image'), [items]);
  const mediaById = useMemo(() => new Map(items.map((item) => [Number(item.id), item])), [items]);
  const lookup = useMemo(() => indexFaces(index), [index]);
  const person = active === null ? undefined : lookup.peopleById.get(active);
  const allFaces = faceView === 'all';
  const showUnknownFaces = faceView === 'unknown';
  const showFaceThumbnails = allFaces || showUnknownFaces;
  const unidentifiedFaces = lookup.unidentified;
  const personFaces = active === null ? EMPTY_FACES : lookup.byPerson.get(active) ?? EMPTY_FACES;
  const faces = allFaces ? index.faces : showUnknownFaces ? unidentifiedFaces : personFaces;
  const faceItems = useMemo(() => mediaForFaces(items, faces), [items, faces]);
  const showDirectory = !allFaces && (Boolean(person) || showUnknownFaces);
  const showManualPhotos = Boolean(person?.media_ids?.length && !selecting && !choosingCover && !showFaceThumbnails);
  const personItems = useMemo(() => mediaForFaces(items, personFaces, person?.media_ids), [items, personFaces, person]);
  const automaticIds = useMemo(() => [...new Set(personFaces.map(face => face.media_id))], [personFaces]);
  const facePages = Math.max(1, Math.ceil((showManualPhotos ? personItems.length : faces.length) / 24));
  const currentFacePage = Math.min(facePage, facePages - 1);
  const search = query.trim().toLocaleLowerCase();
  const matchingPeople = useMemo(() => index.people.filter((entry) => (entry.name.trim() || "이름 없는 사람").toLocaleLowerCase().includes(search)), [index.people, search]);
  useEffect(() => { setPersonPage(0); setUnknownPage(0); openFaceView('people'); }, [query]);
  const personGroups = [
    { title: '등록된 사람', people: matchingPeople.filter((entry) => entry.name.trim()), page: personPage, setPage: setPersonPage },
    { title: '이름 없는 사람', people: matchingPeople.filter((entry) => !entry.name.trim()), page: unknownPage, setPage: setUnknownPage },
  ];
  const blocked = saving || loading;
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
    setFaceAction('move');
    setChosen([]);
    setTarget('');
    setSelecting(false);
    setChoosingCover(false);
    setFacePage(0);
    setSelectingUnknown(false);
    setUnknownChosen([]);
    setExporting(false);
    setManualPhotos(false);
  }

  function openManualPhotos() { manualTarget.current = person?.id ?? null; setManualPhotos(true); }

  async function saveName() {
    if (!person || blocked || locked.current) return;
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
    return () => { disposed = true; alive.current = false; };
  }, [desktop, items]);

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
        <div className="entityHeadingCopy"><h2>{showUnknownFaces ? '이름 없는 사람' : allFaces ? '찾은 얼굴' : person ? person.name.trim() || '이름 없는 사람' : '사람'}</h2>
          {person && <span>사진 {personItems.length}장</span>}
          {showFaceThumbnails && <span>{faces.length}개 얼굴</span>}
        </div>
      </div>
      <div className="peopleActions entityActions">
        {person ? <>
          <button className="primaryControl entityPrimary" aria-label="앨범 만들기" disabled={blocked || !personItems.length} onClick={() => onCreateAlbum(personItems)}><BookPlus size={18} /><span className="entityActionFull">앨범 만들기</span><span className="entityActionShort" aria-hidden="true">새 앨범</span></button>
          <ActionMenu label="사람 관리" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
            { label: '이름 수정', icon: <Pencil size={16} />, onSelect: () => { setName(person.name); setNameMode('new'); setEditingName(true); } },
            { label: '사진 내보내기', icon: <FolderOutput size={16} />, disabled: !personItems.length, onSelect: () => setExporting(true) },
            { label: '대표 사진 변경', icon: <ImageIcon size={16} />, disabled: !personFaces.length, onSelect: () => { setChoosingCover(true); setSelecting(false); setChosen([]); } },
            { label: '사진 정리', icon: <Scissors size={16} />, disabled: !personFaces.length, onSelect: () => { setSelecting(true); setFaceAction(person.name.trim() ? 'confirm' : 'move'); setChoosingCover(false); setChosen([]); } },
          ]} />
        </> : <>
        <button className="primaryControl entityPrimary" disabled={blocked || !desktop} onClick={openManualPhotos}><ImagePlus size={18} />사람 직접 등록</button>
        <ActionMenu label="얼굴 관리" icon={<MoreVertical size={20} />} disabled={blocked} actions={[
          { label: '찾은 얼굴 모두 보기', icon: <Users size={16} />, onSelect: () => openFaceView('all') },
          { label: '얼굴 선택하기', icon: <Check size={16} />, disabled: !index.faces.length, onSelect: () => { if (!showUnknownFaces && !allFaces) openFaceView('all'); setSelecting(true); } },
          { label: '사람 분류 모두 지우기', icon: <Trash2 size={16} />, danger: true, disabled: !desktop || !index.scanned.length, onSelect: () => {
            if (window.confirm('얼굴 분석 정보와 자동 분류를 지울까요? 직접 연결한 사진과 원본은 유지됩니다.')) void edit(async () => { await clearFaceIndex(); openFaceView('people'); setLastExcluded([]); });
          } },
        ]} />
        </>}
      </div>
    </div>
    {!desktop && <p role="status">사람 등록은 감자싹 앱에서 사용할 수 있습니다.</p>}
    {desktop && person && !showFaceThumbnails && <div className="entityManualActions"><button disabled={blocked || !person.name.trim()} onClick={openManualPhotos}><ImagePlus size={18} />사진 직접 등록</button></div>}
    <p className="peopleSectionHint">사진을 직접 골라 사람별로 모아 보세요. 기존에 연결한 사진과 이름은 그대로 유지됩니다.</p>
    {loading && <p role="status"><LoaderCircle size={18} className="spinIcon" />인물 불러오는 중</p>}
    {status && <p role="status">{status}</p>}
    {error && !editingName && <p role="alert" className="faceError">{error}</p>}
    {lastExcluded.length > 0 && <div className="peopleActions"><span>{lastExcluded.length}개 얼굴 제외됨</span><button disabled={blocked} onClick={() => void edit(async () => { await setFacesExcluded(lastExcluded, false); setLastExcluded([]); })}>제외 되돌리기</button></div>}
    {!person && !showFaceThumbnails ? <>
      <div className="peopleSummary">등록된 사람 {index.people.filter(entry => entry.name.trim()).length}명</div>
      {!loading && !index.people.length && <EmptyState icon={<Users size={30} />} title="아직 등록된 사람이 없습니다." description="상단 사람 직접 등록에서 이름과 사진을 선택해 주세요." />}
      {personGroups.map((group) => {
        const pages = Math.max(1, Math.ceil(group.people.length / 24));
        const page = Math.min(group.page, pages - 1);
        return <section key={group.title} aria-label={group.title}>
        <div className="panelHeader"><h3>{group.title} <span>({group.people.length})</span></h3>
        {group.title === '이름 없는 사람' && <div className="peopleActions">
          <button disabled={blocked} onClick={() => { setSelectingUnknown(!selectingUnknown); setUnknownChosen([]); }}><Check size={18} />{selectingUnknown ? '선택 끝내기' : '이름 없는 사람 선택'}</button>
          {selectingUnknown && <><span>{unknownFaceIds.length}개 얼굴 선택</span><button disabled={blocked || !unknownFaceIds.length} onClick={() => {
            if (window.confirm(`선택한 이름 없는 사람의 얼굴 ${unknownFaceIds.length}개를 모두 제외할까요? 원본 사진은 유지됩니다.`)) void edit(async () => {
              await setFacesExcluded(unknownFaceIds, true); setLastExcluded(unknownFaceIds); setUnknownChosen([]);
            });
          }}><X size={18} />선택한 얼굴 제외</button></>}
        </div>}</div>
        {!loading && !group.people.length && <p>{query ? '검색한 이름의 인물이 없습니다.' : group.title === '등록된 사람' ? '이름을 등록한 인물이 없습니다.' : '이름을 붙일 사람이 없습니다.'}</p>}
        {group.title === '이름 없는 사람' && group.people.length > 0 && <p className="peopleSectionHint">사진을 눌러 새 이름을 쓰거나 등록한 사람을 선택하세요.</p>}
      <div className="personGrid">{group.people.slice(page * 24, (page + 1) * 24).map((entry) => {
        const members = lookup.byPerson.get(entry.id) ?? EMPTY_FACES;
        const selectable = !entry.name.trim() && selectingUnknown;
        const cover = members.find((face) => face.id === entry.cover_face_id) ?? members[0];
        return <button className="personTile" key={entry.id} data-cover-face-id={cover?.id} disabled={selectable && blocked} aria-pressed={selectable ? unknownChosen.includes(entry.id) : undefined} onClick={() => {
          if (selectable) { setUnknownChosen((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]); return; }
          openFaceView('people', entry);
        }}>
          {selectable && <span className={`faceCheck ${unknownChosen.includes(entry.id) ? 'checked' : ''}`} aria-hidden="true">{unknownChosen.includes(entry.id) && <Check size={22} strokeWidth={3} />}</span>}
          {cover ? <img src={cover.thumbnail} alt="" loading="lazy" /> : mediaById.get(entry.media_ids?.[0] ?? -1) ? <MediaVisual item={mediaById.get(entry.media_ids![0])!} /> : <div className="personPlaceholder"><Users size={36} /></div>}
          <strong>{entry.name.trim() || '이름 없는 사람'}</strong><span>{new Set([...members.map((face) => face.media_id), ...entry.media_ids ?? []]).size}장</span>
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
            {cover ? <img src={cover.thumbnail} alt="" loading="lazy" /> : mediaById.get(entry.media_ids?.[0] ?? -1) ? <MediaVisual item={mediaById.get(entry.media_ids![0])!} /> : <div className="personPlaceholder"><Users size={22} /></div>}
            <span><strong>{entry.name}</strong><small>사진 {new Set([...members.map((face) => face.media_id), ...entry.media_ids ?? []]).size}장</small></span>
          </button>;
        })}
        <button className={`unknownDirectory${showUnknownFaces ? ' active' : ''}`} aria-pressed={showUnknownFaces} onClick={() => openFaceView('unknown')}><span><strong>이름 없는 사람</strong><small>{unidentifiedFaces.length}개 얼굴</small></span></button>
      </aside>}
      <div className="personDetailContent">
      {choosingCover && <div className="peopleActions"><span>대표로 사용할 사진을 고르세요.</span><button onClick={() => setChoosingCover(false)}>대표 사진 선택 취소</button></div>}
      {selecting && <section className="faceSelectionPanel" aria-label="선택한 얼굴 정리">
        <div className="faceSelectionHeader"><strong>{chosen.length}개 선택</strong><button type="button" disabled={blocked} onClick={() => { setSelecting(false); setChosen([]); setTarget(''); }}>선택 끝내기</button></div>
        <div className="peopleActions faceSelectionActions">
          <label className="faceActionField">작업<select aria-label="얼굴 정리 작업" disabled={blocked} value={faceAction} onChange={event => { setFaceAction(event.target.value); setTarget(''); }}>
            {person?.name.trim() && <option value="confirm">이 사람으로 확인</option>}
            <option value="move">등록한 사람으로 옮기기</option><option value="split">새 사람으로 나누기</option><option value="exclude">잘못 찾은 얼굴 제외</option>
            {person && !allFaces && <option value="album">선택한 사진으로 앨범 만들기</option>}
          </select></label>
          {faceAction === 'move' && <label className="faceActionField">옮길 사람<select aria-label="옮길 사람" disabled={blocked} value={target} onChange={event => setTarget(event.target.value)}><option value="">사람 선택</option>{index.people.filter(entry => entry.id !== active).map(entry => <option key={entry.id} value={entry.id}>{entry.name.trim() || `이름 없는 사람 ${entry.id}`}</option>)}</select></label>}
          {faceAction === 'confirm' && person?.name.trim() && <button className="primaryControl" disabled={blocked || !chosen.length} onClick={() => void edit(() => moveFaces(chosen,person.id)).then(saved => { if(saved && alive.current) setStatus('선택한 얼굴을 이 인물의 기준으로 확인했습니다.'); })}><Check size={18} />이 사람 맞아요</button>}
          {faceAction === 'move' && <button className="primaryControl" disabled={blocked || !chosen.length || !target} onClick={() => void edit(() => moveFaces(chosen, Number(target)))}><Users size={18} />옮기기</button>}
          {faceAction === 'split' && <button className="primaryControl" disabled={blocked || !chosen.length} onClick={() => void edit(() => moveFaces(chosen, null))}><Scissors size={18} />다른 사람으로 나누기</button>}
          {faceAction === 'exclude' && <button className="primaryControl" disabled={blocked || !chosen.length} onClick={() => { if (window.confirm(`선택한 얼굴 ${chosen.length}개를 인물 목록과 얼굴 비교에서 제외할까요? 원본 사진은 유지됩니다.`)) void edit(async () => { await setFacesExcluded(chosen, true); setLastExcluded(chosen); }); }}><X size={18} />얼굴 제외</button>}
          {faceAction === 'album' && <button className="primaryControl" disabled={blocked || !chosenAlbumItems.length} onClick={() => onCreateAlbum(chosenAlbumItems)}><BookPlus size={18} />앨범 만들기 ({chosenAlbumItems.length})</button>}
        </div>
        <p className="peopleSectionHint">아래 사진을 고른 뒤 적용하세요.</p>
      </section>}
      {!(showManualPhotos ? personItems.length : faces.length) && <div className="emptyState"><Users size={30} /><p>{showUnknownFaces ? '이름을 붙일 사람이 없습니다.' : person && !selecting && !choosingCover ? '아직 연결한 사진이 없습니다. 사진 직접 등록에서 선택해 주세요.' : '표시할 얼굴이 없습니다.'}</p></div>}
      <div className={`personPhotoGrid${showFaceThumbnails ? ' faceOverviewGrid' : person ? ' personMediaGrid' : ''}${selecting ? ' selecting' : ''}`} {...dragSelection}>{showManualPhotos ? personItems.slice(currentFacePage * 24, (currentFacePage + 1) * 24).map(item => <article key={item.id} className="personPhoto"><button className="personOriginal" aria-label="사진 상세보기" onClick={() => onOpen(item, personItems)}><MediaVisual item={item} /></button><div className="personPhotoMeta"><span>{item.takenAt ?? '날짜 없음'}</span>{!automaticIds.includes(Number(item.id)) && <span>직접 등록</span>}</div></article>) : faces.slice(currentFacePage * 24, (currentFacePage + 1) * 24).map((face) => {
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
          <div className="personPhotoMeta">{showFaceThumbnails && <img src={face.thumbnail} alt="분류된 얼굴" />}<span>{item?.takenAt ?? '날짜 없음'}</span>{face.confirmed && <span>확인</span>}</div>
        </article>;
      })}</div>
      {facePages > 1 && <div className="peopleActions"><button disabled={currentFacePage === 0} onClick={() => setFacePage(currentFacePage - 1)}>이전</button><span>{currentFacePage + 1} / {facePages}</span><button disabled={currentFacePage === facePages - 1} onClick={() => setFacePage(currentFacePage + 1)}>다음</button></div>}
      </div>
    </div>}
    {person && editingName && <EntityEditorDialog title={person.name.trim() ? '이름 수정' : '이름 등록'} busy={blocked} className="personEditor" onClose={() => { setName(person.name); setTarget(''); setEditingName(false); }}>
      <form onSubmit={event => { event.preventDefault(); if (nameMode === 'existing') { const destination = lookup.peopleById.get(Number(target)); if (destination?.name.trim()) void edit(() => person.media_ids?.length || !personFaces.length ? mergeRegisteredPeople([person.id], destination.id) : moveFaces(personFaces.map(face => face.id), destination.id)).then(saved => { if (saved && alive.current) { openFaceView('people', destination); setStatus(`${destination.name}의 사진으로 저장했습니다.`); } }); } else void saveName(); }}>
        <div className="entityEditBody">
          <div className="entityEditIdentity">{personFaces.length ? <img src={(personFaces.find(face => face.id === person.cover_face_id) ?? personFaces[0]).thumbnail} alt="" /> : personItems[0] ? <MediaVisual item={personItems[0]} /> : <Users size={32} />}<div><strong>{person.name.trim() || '이름 없는 사람'}</strong><small>사진 {personItems.length}장</small></div></div>
          {!person.name.trim() && index.people.some(entry => entry.name.trim()) && <div className="entityEditModes" aria-label="이름 등록 방법"><button type="button" aria-pressed={nameMode === 'new'} disabled={blocked} onClick={() => setNameMode('new')}>새 이름 입력</button><button type="button" aria-pressed={nameMode === 'existing'} disabled={blocked} onClick={() => setNameMode('existing')}>등록한 사람 선택</button></div>}
          {nameMode === 'new' ? <label className="entityEditField">이름<input aria-label="인물 이름" placeholder="이름을 입력하세요" maxLength={80} value={name} disabled={blocked} onChange={event => setName(event.target.value)} /></label> : <label className="entityEditField">이미 등록한 사람<select aria-label="이미 등록한 사람" value={target} disabled={blocked} onChange={event => setTarget(event.target.value)}><option value="">사람 선택</option>{index.people.filter(entry => entry.name.trim() && entry.id !== person.id).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
          {nameMode === 'existing' && <p>선택한 사람의 사진으로 함께 모아집니다.</p>}
          {error && <p role="alert" className="entityEditError">{error}</p>}
        </div>
        <footer className="peopleActions entityEditFooter"><button type="button" disabled={blocked} onClick={() => { setName(person.name); setTarget(''); setEditingName(false); }}>취소</button><button type="submit" className="primaryControl" disabled={blocked || (nameMode === 'existing' ? !target || !personItems.length && !personFaces.length : !sameNamePeople.length && trimmedName === person.name)}>{saving ? <LoaderCircle className="spinIcon" size={18} /> : <Check size={18} />}{nameMode === 'existing' ? '이 사람으로 저장' : sameNamePeople.length ? '같은 이름 합치기' : '이름 저장'}</button></footer>
      </form>
    </EntityEditorDialog>}
    {exporting && person && <ExportModal title={person.name.trim() || `이름 없는 사람 ${person.id}`} items={personItems} onClose={() => setExporting(false)} />}
    {manualPhotos && <EntityPhotoPicker title={person ? '사람 사진 직접 등록' : '사람 직접 등록'} name={person?.name} photos={photos} initialIds={person?.media_ids} automaticIds={automaticIds} onClose={() => setManualPhotos(false)} onSave={async (draft, ids) => {
      if (!person && manualTarget.current !== null) await renamePerson(manualTarget.current, draft);
      const id = await saveManualPersonPhotos(manualTarget.current, draft, ids); manualTarget.current = id;
      const next = await loadFaceIndex(); setIndex(next); openFaceView('people', next.people.find(entry => entry.id === id));
    }} />}
  </section>;
}
