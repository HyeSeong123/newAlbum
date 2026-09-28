import { useEffect, useState, type FormEvent } from "react";
import { localDateKey } from "../calendar/calendarModel";
import { Pencil } from "lucide-react";
import { EmptyState } from "../../components/MediaVisual";
import type { SavedAlbum } from "../../types/media";
import { isTauriRuntime, listDiary, saveDiary, assignDiaryAlbum, deleteDiary } from "../../services/tauriMediaService";
import "./diary.css";

export interface DiaryEntry { id: number; date: string; title: string; body: string; mood: string; weather: string; album_id: number | null }
const moods = ["기쁨", "평온", "그리움", "슬픔", "설렘"];
const weathers = ["맑음", "흐림", "비", "눈", "바람"];
const moodIcon: Record<string, string> = { 기쁨: "😊", 평온: "😌", 그리움: "🥹", 슬픔: "😢", 설렘: "🥰" };
const weatherIcon: Record<string, string> = { 맑음: "☀️", 흐림: "☁️", 비: "🌧️", 눈: "❄️", 바람: "🍃" };
const key = "warm-journal-diaries-v1";
function browserRead(): DiaryEntry[] { try { return JSON.parse(localStorage.getItem(key) || "[]") as DiaryEntry[]; } catch { return []; } }
export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const desktop = isTauriRuntime();
  useEffect(() => { if (desktop) void listDiary().then((records) => { setEntries(records); setLoaded(true); }).catch(() => setError("일기를 불러오지 못했습니다. 앱을 다시 실행해 주세요.")); else { setEntries(browserRead()); setLoaded(true); } }, [desktop]);
  async function reload() { if (desktop) setEntries(await listDiary()); }
  async function save(entry: DiaryEntry) {
    if (desktop) { await saveDiary(entry); await reload(); }
    else { const next = entry.id ? entries.map(e => e.id === entry.id ? entry : e) : [{ ...entry, id: Date.now() }, ...entries]; setEntries(next); localStorage.setItem(key, JSON.stringify(next)); }
  }
  async function assign(ids: number[], albumId: number | null) {
    if (desktop) { await assignDiaryAlbum(ids, albumId); await reload(); }
    else { const next = entries.map(e => ids.includes(e.id) ? { ...e, album_id: albumId } : e); setEntries(next); localStorage.setItem(key, JSON.stringify(next)); }
  }
  async function remove(id: number) {
    if (desktop) { await deleteDiary(id); await reload(); }
    else { const next = entries.filter(e => e.id !== id); setEntries(next); localStorage.setItem(key, JSON.stringify(next)); }
  }
  return { entries, loaded, error, save, assign, remove };
}

export function DiaryView({ entries, albums, query = "", onSave, onAssign, onDelete, error }: {
  entries: DiaryEntry[]; albums: SavedAlbum[]; query?: string; onSave: (entry: DiaryEntry) => Promise<void>;
  onAssign: (ids: number[], albumId: number | null) => Promise<void>; onDelete: (id: number) => Promise<void>; error: string;
}) {
  const blank = (): DiaryEntry => ({ id: 0, date: localDateKey(new Date()), title: "", body: "", mood: "평온", weather: "맑음", album_id: null });
  const [draft, setDraft] = useState<DiaryEntry | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<void>, success: string) { setBusy(true); setMessage(""); try { await action(); setMessage(success); } catch { setMessage("저장하지 못했습니다. 입력한 내용은 화면에 남아 있습니다. 다시 저장해 주세요."); } finally { setBusy(false); } }
  function submit(event: FormEvent) { event.preventDefault(); if (!draft) return; void run(async () => { await onSave(draft); setDraft(null); }, "일기를 저장했습니다."); }
  function move(ids: number[], target: string) { void run(async () => { await onAssign(ids, target ? Number(target) : null); setSelected([]); }, "앨범 위치를 저장했습니다."); }
  const visible = entries.filter(entry => `${entry.title} ${entry.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return <div className="diaryView">
    <header className="diaryHeading"><div><span>하루를 천천히 적어 두는 곳</span><h2>나의 일기장</h2></div><button className="primary" onClick={() => setDraft(blank())}>+ 일기 쓰기</button></header>
    {!!entries.length && <div className="diaryListTools"><span>{visible.length}편의 일기</span><button aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? "선택 끝내기" : "일기 선택"}</button></div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {selecting && <div className="diaryBulk"><strong>{selected.length}편 선택</strong><button onClick={() => setSelected(visible.every(entry => selected.includes(entry.id)) ? selected.filter(id => !visible.some(entry => entry.id === id)) : [...new Set([...selected, ...visible.map(entry => entry.id)])])} disabled={!visible.length}>{visible.length && visible.every(entry => selected.includes(entry.id)) ? "현재 결과 선택 해제" : "현재 결과 전체 선택"}</button><label>앨범으로 이동 <select aria-label="선택한 일기의 앨범" value={destination} onChange={e => setDestination(e.target.value)}><option value="">일기장에 두기</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><button className="primary" disabled={busy || !selected.length} onClick={() => move(selected, destination)}>일괄 이동</button></div>}
    {!entries.length && <EmptyState title="아직 적은 일기가 없습니다." description="오늘 기억하고 싶은 일을 적어보세요." actionLabel="첫 일기 쓰기" actionIcon={<Pencil size={18} />} onAction={() => setDraft(blank())} />}
    <div className="diaryCards">{visible.map(entry => <article key={entry.id} className="diaryCard">
      {selecting && <label className="diarySelect"><input type="checkbox" checked={selected.includes(entry.id)} onChange={e => setSelected(current => e.target.checked ? [...current, entry.id] : current.filter(id => id !== entry.id))} aria-label={`${entry.title} 선택`} />선택</label>}
      <button className="diaryOpen" onClick={() => selecting ? setSelected(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id]) : setDraft({ ...entry })} aria-pressed={selecting ? selected.includes(entry.id) : undefined}><time>{entry.date}</time><h3>{entry.title}</h3><p>{entry.body || "내용을 적어 주세요."}</p><span>{moodIcon[entry.mood]} {entry.mood} · {weatherIcon[entry.weather]} {entry.weather}</span></button>
      <small>{albums.find(a => Number(a.id) === entry.album_id)?.title ?? "내 일기장"}</small>
    </article>)}</div>
    {draft && <div className="modalBackdrop"><section className="diaryDialog" role="dialog" aria-modal="true" aria-label={draft.id ? "일기 상세" : "새 일기"}>
      <form onSubmit={submit}><div className="diaryDialogTop"><strong>{draft.id ? "그날의 일기" : "오늘의 일기"}</strong><button type="button" onClick={() => setDraft(null)}>닫기</button></div>
        <label>날짜<input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
        <label>제목<input required maxLength={120} placeholder="오늘을 기억할 제목" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <div className="diaryPair"><label>오늘의 기분<select value={draft.mood} onChange={e => setDraft({ ...draft, mood: e.target.value })}>{moods.map(m => <option key={m} value={m}>{moodIcon[m]} {m}</option>)}</select></label><label>날씨<select value={draft.weather} onChange={e => setDraft({ ...draft, weather: e.target.value })}>{weathers.map(w => <option key={w} value={w}>{weatherIcon[w]} {w}</option>)}</select></label></div>
        <label>내용<textarea maxLength={20000} rows={10} placeholder="오늘은 어떤 하루였나요?" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
        <label>앨범<select value={draft.album_id ?? ""} onChange={e => setDraft({ ...draft, album_id: e.target.value ? Number(e.target.value) : null })}><option value="">내 일기장</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        <div className="diaryDialogActions">{draft.id > 0 && <button type="button" disabled={busy} onClick={() => { if (confirm("이 일기를 삭제할까요?")) void run(async () => { await onDelete(draft.id); setDraft(null); }, "일기를 삭제했습니다."); }}>삭제</button>}<button className="primary" type="submit" disabled={busy}>{busy ? "저장 중" : "일기 저장"}</button></div>
      </form></section></div>}
  </div>;
}
