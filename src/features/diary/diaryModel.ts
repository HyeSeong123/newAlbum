export const MAX_DIARY_PHOTOS = 6;
export const DIARY_PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic";

export interface DiaryPhoto { id: number | string; file_path: string; data_url?: string }
export interface DiaryEntry {
  id: number; date: string; title: string; body: string; mood: string; weather: string;
  album_id: number | null; photos?: DiaryPhoto[];
}

export function appendDiaryPhotos(current: DiaryPhoto[], incoming: DiaryPhoto[]): DiaryPhoto[] {
  const result = [...current];
  const ids = new Set(current.map(photo => String(photo.id)));
  for (const photo of incoming) {
    if (ids.has(String(photo.id))) continue;
    ids.add(String(photo.id)); result.push(photo);
  }
  if (result.length > MAX_DIARY_PHOTOS) throw new Error("사진은 최대 6장까지 첨부할 수 있어요.");
  return result;
}

export function validateDiary(entry: DiaryEntry) {
  const date = new Date(`${entry.date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(date.getTime()) ||
      date.getDate() !== Number(entry.date.slice(8)) || !entry.title.trim() ||
      entry.title.length > 120 || entry.body.length > 20000) throw new Error("날짜와 제목, 내용을 확인해 주세요.");
  const photos = entry.photos ?? [];
  if (photos.length > MAX_DIARY_PHOTOS || new Set(photos.map(p => String(p.id))).size !== photos.length)
    throw new Error("사진은 중복 없이 최대 6장까지 첨부할 수 있어요.");
}

export function diaryDateLabel(value: string, long = false) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(date);
  return long ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}`
    : `${value.slice(5).replace("-", ".")} ${weekday}`;
}
