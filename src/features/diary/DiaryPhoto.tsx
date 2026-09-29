import { useState } from "react";
import { ImageOff } from "lucide-react";
import { getMediaSource } from "../../components/MediaVisual";
import type { DiaryPhoto as Photo } from "./diaryModel";

export function DiaryPhoto({ photo }: { photo: Photo }) {
  const [failed, setFailed] = useState(false);
  const source = getMediaSource({ filePath: photo.file_path, previewUrl: photo.data_url });
  return source && !failed
    ? <img src={source} alt={photo.file_path.split(/[\\/]/).pop() || "일기 첨부 사진"} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="diaryPhotoMissing"><ImageOff size={22} /><span>사진을 불러올 수 없어요</span></span>;
}
