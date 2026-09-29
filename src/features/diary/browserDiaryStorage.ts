import { DIARY_PHOTO_ACCEPT, MAX_DIARY_PHOTOS, type DiaryEntry, type DiaryPhoto } from "./diaryModel";

const legacyKey = "warm-journal-diaries-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("warm-journal-diaries", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readBrowserDiaries(): Promise<DiaryEntry[]> {
  const db = await database();
  try {
    const stored = await new Promise<DiaryEntry[] | undefined>((resolve, reject) => {
      const request = db.transaction("records").objectStore("records").get("entries");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const entries: unknown = stored ?? JSON.parse(localStorage.getItem(legacyKey) || "[]");
    if (!Array.isArray(entries)) throw new Error("일기 목록 형식 오류");
    return entries as DiaryEntry[];
  } finally { db.close(); }
}

// Photo data lives in IndexedDB, not localStorage's small string quota or expiring blob URLs.
export async function writeBrowserDiaries(entries: DiaryEntry[]): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(entries, "entries");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function readDiaryPhotoFiles(files: File[], remaining: number): Promise<DiaryPhoto[]> {
  if (files.length > Math.min(remaining, MAX_DIARY_PHOTOS)) throw new Error("사진은 최대 6장까지 첨부할 수 있어요.");
  const extensions = DIARY_PHOTO_ACCEPT.split(",");
  if (files.some(file => !extensions.includes(`.${file.name.split(".").pop()?.toLowerCase()}`)))
    throw new Error("사진 파일만 첨부할 수 있어요.");
  return Promise.all(files.map(file => new Promise<DiaryPhoto>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: `${file.name}:${file.size}:${file.lastModified}`, file_path: file.name, data_url: String(reader.result) });
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다. 다시 선택해 주세요."));
    reader.readAsDataURL(file);
  })));
}
