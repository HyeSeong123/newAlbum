import { useEffect, useRef, useState } from "react";
import { isTauriRuntime, listDiary, saveDiary, assignDiaryAlbum, deleteDiary } from "../../services/tauriMediaService";
import { readBrowserDiaries, writeBrowserDiaries } from "./browserDiaryStorage";
import { validateDiary, type DiaryEntry } from "./diaryModel";

export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const current = useRef(entries);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const desktop = isTauriRuntime();
  function publish(records: DiaryEntry[]) { current.current = records; setEntries(records); }
  useEffect(() => {
    let disposed = false;
    void (desktop ? listDiary() : readBrowserDiaries()).then(records => {
      if (!Array.isArray(records)) throw new Error("일기 목록 형식 오류");
      if (!disposed) { publish(records); setLoaded(true); }
    }).catch(() => { if (!disposed) setError("일기를 불러오지 못했습니다. 앱을 다시 실행해 주세요."); });
    return () => { disposed = true; };
  }, [desktop]);
  function requireLoaded() { if (!loaded) throw new Error("기존 일기를 불러온 뒤 변경할 수 있습니다."); }
  async function reload() { if (desktop) publish(await listDiary()); }
  async function persist(next: DiaryEntry[]) { await writeBrowserDiaries(next); publish(next); }
  async function save(entry: DiaryEntry) {
    requireLoaded(); validateDiary(entry);
    const normalized = { ...entry, title: entry.title.trim(), photos: entry.photos ?? [] };
    if (desktop) { await saveDiary(normalized); await reload(); }
    else await persist(entry.id ? current.current.map(e => e.id === entry.id ? normalized : e)
      : [{ ...normalized, id: current.current.reduce((id, entry) => Math.max(id, entry.id + 1), Date.now()) }, ...current.current]);
  }
  async function assign(ids: number[], albumId: number | null) {
    requireLoaded();
    if (desktop) { await assignDiaryAlbum(ids, albumId); await reload(); }
    else await persist(current.current.map(e => ids.includes(e.id) ? { ...e, album_id: albumId } : e));
  }
  async function remove(id: number) {
    requireLoaded();
    if (desktop) { await deleteDiary(id); await reload(); }
    else await persist(current.current.filter(e => e.id !== id));
  }
  return { entries, loaded, error, save, assign, remove };
}
