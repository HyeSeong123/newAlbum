import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bookmark, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Cloud, CloudRain, CloudSnow, MoreHorizontal, Pencil, Plus, Search, Smile, Sun, Trash2, Wind, X } from "lucide-react";
import { localDateKey } from "../calendar/calendarModel";
import { ActionMenu } from "../../components/ActionMenu";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import type { SavedAlbum } from "../../types/media";
import { chooseDiaryPhotos, isTauriRuntime } from "../../services/tauriMediaService";
import { readDiaryPhotoFiles } from "./browserDiaryStorage";
import { appendDiaryPhotos, diaryDateLabel, DIARY_PHOTO_ACCEPT, MAX_DIARY_PHOTOS, type DiaryEntry, type DiaryPhoto as Photo } from "./diaryModel";
import { DiaryPhoto } from "./DiaryPhoto";
import "@fontsource/noto-serif-kr/400.css";
import "@fontsource/noto-serif-kr/500.css";
import "@fontsource/noto-serif-kr/korean-400.css";
import "@fontsource/noto-serif-kr/korean-500.css";
import "./diary.css";
export { useDiary } from "./useDiary";
export type { DiaryEntry } from "./diaryModel";

const moods = ["기쁨", "평온", "그리움", "슬픔", "설렘"];
const weathers = ["맑음", "흐림", "비", "눈", "바람"];
const weatherIcons = { 맑음: Sun, 흐림: Cloud, 비: CloudRain, 눈: CloudSnow, 바람: Wind };
function Weather({ value }: { value: string }) { const Icon = weatherIcons[value as keyof typeof weatherIcons] ?? Sun; return <Icon size={17} aria-hidden="true" />; }

export function DiaryView({ entries, albums, query = "", onQueryChange, onSave, onAssign, onDelete, onPhotosImported, error }: {
  entries: DiaryEntry[]; albums: SavedAlbum[]; query?: string; onQueryChange: (query: string) => void;
  onSave: (entry: DiaryEntry) => Promise<void>; onAssign: (ids: number[], albumId: number | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>; onPhotosImported?: () => Promise<void>; error: string;
}) {
  const blank = (): DiaryEntry => ({ id: 0, date: localDateKey(new Date()), title: "", body: "", mood: "평온", weather: "맑음", album_id: null, photos: [] });
  const [draft, setDraft] = useState<DiaryEntry | null>(null);
  const original = useRef("");
  const [month, setMonth] = useState("");
  const monthTouched = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const saving = useRef(false);
  const importing = useRef(false);
  const [message, setMessage] = useState("");
  const [draftError, setDraftError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const photos = draft?.photos ?? [];

  useEffect(() => {
    if (!monthTouched.current && !month && entries.length) {
      setMonth(entries.reduce((latest, entry) => entry.date.slice(0, 7) > latest ? entry.date.slice(0, 7) : latest, ""));
    }
  }, [entries, month]);

  function updateDraft(patch: Partial<DiaryEntry>) { setDraft(current => current ? { ...current, ...patch } : current); }
  function open(entry: DiaryEntry) {
    const next = { ...entry, photos: [...(entry.photos ?? [])] };
    original.current = JSON.stringify(next); setDraftError(""); setDraft(next);
  }
  function close() {
    if (saving.current || importing.current) return;
    if (draft && JSON.stringify(draft) !== original.current && !window.confirm("저장하지 않은 내용이 있어요. 작성을 닫을까요?")) return;
    setDraft(null); setDraftError("");
  }
  useModalBehavior(close, { enabled: Boolean(draft) });
  useEffect(() => {
    if (!draft) return;
    const previous = document.activeElement as HTMLElement | null;
    if (window.matchMedia("(max-width: 999px)").matches) form.current?.focus();
    else form.current?.querySelector<HTMLInputElement>(".diaryTitleInput")?.focus();
    return () => { previous?.focus(); };
  }, [Boolean(draft)]);

  async function run(action: () => Promise<void>, success: string) {
    if (saving.current || importing.current) return;
    saving.current = true; setBusy(true); setMessage(""); setDraftError("");
    try { await action(); setMessage(success); }
    catch (failure) {
      const text = failure instanceof Error ? failure.message : typeof failure === "string" ? failure : "저장하지 못했습니다. 다시 시도해 주세요.";
      if (draft) setDraftError(`${text} 입력한 내용은 그대로 남아 있어요.`); else setMessage(text);
    } finally { saving.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    void run(async () => { await onSave(draft); setMonth(draft.date.slice(0, 7)); setDraft(null); }, "일기를 저장했습니다.");
  }
  function move(ids: number[], target: string) {
    void run(async () => { await onAssign(ids, target ? Number(target) : null); setSelected([]); }, "앨범 위치를 저장했습니다.");
  }
  function remove(entry: DiaryEntry) {
    if (window.confirm("이 일기를 삭제할까요? 원본 사진은 그대로 남습니다."))
      void run(async () => { await onDelete(entry.id); if (draft?.id === entry.id) setDraft(null); }, "일기를 삭제했습니다.");
  }
  async function attach(read: () => Promise<Photo[]>) {
    if (!draft || saving.current || importing.current) return;
    importing.current = true; setAdding(true); setDraftError("");
    try {
      const incoming = await read();
      const next = appendDiaryPhotos(photos, incoming);
      setDraft(current => current ? { ...current, photos: next } : current);
      if (incoming.length && onPhotosImported) {
        try { await onPhotosImported(); } catch { /* The attachment itself has already been imported successfully. */ }
      }
    } catch (failure) { setDraftError(failure instanceof Error ? failure.message : typeof failure === "string" ? failure : "사진을 가져오지 못했습니다. 다시 선택해 주세요."); }
    finally { importing.current = false; setAdding(false); }
  }
  function addPhotos() {
    if (photos.length >= MAX_DIARY_PHOTOS || busy || adding) return;
    if (isTauriRuntime()) void attach(() => chooseDiaryPhotos(MAX_DIARY_PHOTOS - photos.length));
    else fileInput.current?.click();
  }
  function changeMonth(delta: number) {
    const base = new Date(`${month || localDateKey(new Date()).slice(0, 7)}-01T12:00:00`);
    base.setMonth(base.getMonth() + delta); monthTouched.current = true; setMonth(localDateKey(base).slice(0, 7)); setSelected([]);
  }
  const visible = useMemo(() => entries.filter(entry => {
    if (query.trim()) return `${entry.title} ${entry.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return !month || entry.date.startsWith(month);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [entries, month, query]);
  const monthTitle = month ? `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월` : "모든 날의 기록";

  return <div className="diaryView">
    <header className="diaryHeading">
      <div><span className="diaryEyebrow">감자싹 · 하루의 기록</span><h1>나의 일기장</h1><p>평범한 하루도, 오래 간직하고 싶은 이야기.</p></div>
      <div className="diaryHeadingActions">
        <label className="diarySearch"><Search size={17} /><input aria-label="일기 검색" placeholder="일기 검색" value={query} onChange={e => onQueryChange(e.target.value)} />{query && <button type="button" aria-label="검색 지우기" onClick={() => onQueryChange("")}><X size={15} /></button>}</label>
        <button className="diaryPrimary" onClick={() => open(blank())} disabled={!!error}><Pencil size={16} />일기 쓰기</button>
      </div>
    </header>
    <div className="diaryListTools">
      <div className="diaryMonthNav"><button aria-label="이전 달" onClick={() => changeMonth(-1)} disabled={!!query}><ChevronLeft size={18} /></button><label><span>{query ? "찾아본 이야기" : monthTitle}</span><input type="month" aria-label="일기 월 선택" value={month} onInput={e => { monthTouched.current = true; setMonth(e.currentTarget.value); setSelected([]); }} disabled={!!query} /></label><button aria-label="다음 달" onClick={() => changeMonth(1)} disabled={!!query}><ChevronRight size={18} /></button>{month && <button className="diaryAllMonths" onClick={() => { monthTouched.current = true; setMonth(""); }}>전체 일기</button>}</div>
      <div className="diaryListCount"><span>{visible.length}편의 기록</span>{!!entries.length && <button aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]); }}><CheckSquare size={15} />{selecting ? "선택 끝내기" : "일기 선택"}</button>}</div>
    </div>
    {error && <p className="diaryNotice" role="alert">{error}</p>}{message && <p className="diaryNotice" role="status">{message}</p>}
    {selecting && <div className="diaryBulk"><strong>{selected.length}편 선택</strong><button onClick={() => setSelected(visible.every(entry => selected.includes(entry.id)) ? selected.filter(id => !visible.some(entry => entry.id === id)) : [...new Set([...selected, ...visible.map(entry => entry.id)])])} disabled={!visible.length}>{visible.length && visible.every(entry => selected.includes(entry.id)) ? "현재 결과 선택 해제" : "현재 결과 전체 선택"}</button><label>앨범으로 이동 <select aria-label="선택한 일기의 앨범" value={destination} onChange={e => setDestination(e.target.value)}><option value="">일기장에 두기</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><button className="diaryPrimary" disabled={busy || !selected.length} onClick={() => move(selected, destination)}>일괄 이동</button></div>}
    {!error && !visible.length && <section className="diaryEmpty" aria-label="빈 일기장">
      <Bookmark className="diaryBookmark" size={30} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <span className="diaryEmptyEyebrow">나의 일기장</span>
      <h2>{!entries.length ? "아직 펼치지 않은 첫 페이지" : query ? "찾는 이야기가 없어요" : "이번 달은 아직 빈 페이지예요"}</h2>
      <p>{!entries.length ? "오늘의 마음과 사진을 한 장씩 남겨 보세요." : query ? "다른 단어로 일기를 찾아보세요." : "오늘의 기록을 남기거나 다른 달의 일기를 펼쳐 보세요."}</p>
      <div className="diaryEmptyLines" aria-hidden="true" />
      {!entries.length && <button className="diaryPrimary" onClick={() => open(blank())}><Pencil size={16} />첫 일기 쓰기</button>}
    </section>}
    <div className="diaryCards">{visible.map(entry => <article key={entry.id} className={`diaryCard${selected.includes(entry.id) ? " isSelected" : ""}`}>
      <Bookmark className="diaryBookmark" size={28} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <div className="diaryCardMenu">{selecting ? <label className="diarySelect"><input type="checkbox" checked={selected.includes(entry.id)} onChange={e => setSelected(current => e.target.checked ? [...current, entry.id] : current.filter(id => id !== entry.id))} aria-label={`${entry.title} 선택`} /><span>선택</span></label> : <ActionMenu label={`${entry.title} 일기 메뉴`} icon={<MoreHorizontal size={19} />} disabled={busy} actions={[{ label: "일기 수정", icon: <Pencil size={16} />, onSelect: () => open(entry) }, { label: "일기 삭제", icon: <Trash2 size={16} />, danger: true, onSelect: () => remove(entry) }]} />}</div>
      <button className="diaryOpen" onClick={() => selecting ? setSelected(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id]) : open(entry)} aria-pressed={selecting ? selected.includes(entry.id) : undefined}>
        <time dateTime={entry.date}>{diaryDateLabel(entry.date)}</time>
        <span className="diaryAtmosphere"><Weather value={entry.weather} />{entry.weather}<span aria-hidden="true">·</span>{entry.mood}</span>
        <h3>{entry.title}</h3><p className={(entry.photos?.length ?? 0) ? "" : "diaryLongExcerpt"}>{entry.body || "그날의 이야기를 이어 적어 보세요."}</p>
        {!!entry.photos?.length && <span className="diaryPhotoPrints">{entry.photos.slice(0, 2).map(photo => <span className="diaryPhotoPrint" key={photo.id}><DiaryPhoto photo={photo} /></span>)}</span>}
        <span className="diaryCardFoot">{entry.photos?.length ? `사진 ${entry.photos.length}장` : ""}<span>{albums.find(a => Number(a.id) === entry.album_id)?.title ?? "내 일기장"}</span></span>
      </button>
    </article>)}</div>
    {draft && <div className="modalBackdrop diaryBackdrop"><section className="diaryDialog" role="dialog" aria-modal="true" aria-label={draft.id ? "일기 상세" : "새 일기"}>
      <Bookmark className="diaryBookmark" size={30} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <form ref={form} tabIndex={-1} onSubmit={submit} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), textarea:not(:disabled)')).filter(el => el.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === form.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}><fieldset disabled={busy || adding}>
        <div className="diaryDialogTop"><span>{draft.id ? "그날의 기록" : "오늘의 기록"}</span><button className="diaryIconButton" type="button" aria-label="닫기" onClick={close}><X size={21} /></button></div>
        <div className="diaryMetadata"><label className="diaryDateInput"><CalendarDays size={18} /><span>{diaryDateLabel(draft.date, true)}</span><input aria-label="날짜" type="date" required value={draft.date} onInput={e => updateDraft({ date: e.currentTarget.value })} /></label><div className="diaryMoodWeather"><label><Weather value={draft.weather} /><select aria-label="날씨" value={draft.weather} onChange={e => updateDraft({ weather: e.target.value })}>{weathers.map(w => <option key={w}>{w}</option>)}</select></label><label><Smile size={18} /><select aria-label="오늘의 기분" value={draft.mood} onChange={e => updateDraft({ mood: e.target.value })}>{moods.map(m => <option key={m}>{m}</option>)}</select></label></div></div>
        <div className="diaryEditorBody"><div className="diaryWriting"><input className="diaryTitleInput" aria-label="제목" required maxLength={120} placeholder="오늘을 기억할 제목" value={draft.title} onChange={e => updateDraft({ title: e.target.value })} /><textarea aria-label="내용" maxLength={20000} rows={8} placeholder="오늘은 어떤 하루였나요?" value={draft.body} onChange={e => updateDraft({ body: e.target.value })} /></div>
        <div className="diaryEditorSide"><div className="diaryAttachments"><div className="diaryAttachmentHeading"><span>오늘의 사진 <strong aria-live="polite">{photos.length} / {MAX_DIARY_PHOTOS}</strong></span><button type="button" disabled={photos.length >= MAX_DIARY_PHOTOS || busy || adding} onClick={addPhotos}><Plus size={15} />사진 추가</button></div>
          <input ref={fileInput} type="file" accept={DIARY_PHOTO_ACCEPT} multiple hidden aria-label="일기 사진 파일" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void attach(() => readDiaryPhotoFiles(files, MAX_DIARY_PHOTOS - photos.length)); }} />
          <div className="diaryAttachmentList">{photos.map((photo, index) => <div className="diaryAttachmentPrint" key={photo.id}><DiaryPhoto photo={photo} /><button type="button" className="diaryRemovePhoto" aria-label={`${index + 1}번째 사진 삭제`} onClick={() => updateDraft({ photos: photos.filter(p => p.id !== photo.id) })}><X size={14} /></button></div>)}{photos.length < MAX_DIARY_PHOTOS && <button type="button" className="diaryAddPhoto" onClick={addPhotos} aria-label="일기 사진 추가"><Plus size={22} /><span>{adding ? "사진을 가져오는 중" : "사진 추가"}</span></button>}</div>
          <p className="diaryPhotoHint" aria-live="polite">{adding ? "사진을 가져오고 있어요." : photos.length === MAX_DIARY_PHOTOS ? "사진 6장을 모두 담았어요. 바꾸려면 사진을 먼저 빼 주세요." : "사진은 최대 6장까지 첨부할 수 있어요."}</p>
        </div>
        <label className="diaryAlbumChoice">담을 앨범<select aria-label="앨범" value={draft.album_id ?? ""} onChange={e => updateDraft({ album_id: e.target.value ? Number(e.target.value) : null })}><option value="">내 일기장</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        {draftError && <p className="diaryNotice diaryError" role="alert">{draftError}</p>}
        </div></div>
        <div className="diaryDialogActions">{draft.id > 0 && <button className="diaryDelete" type="button" onClick={() => remove(draft)}><Trash2 size={15} />삭제</button>}<button className="diaryCancel" type="button" onClick={close}>취소</button><button className="diaryPrimary" type="submit" disabled={busy || adding}>{busy ? "저장 중" : "일기 저장"}</button></div>
      </fieldset></form></section></div>}
  </div>;
}
