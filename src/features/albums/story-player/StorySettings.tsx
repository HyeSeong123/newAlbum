import { useState } from "react";
import type { AlbumContent } from "../../../types/media";
import { chooseAlbumMusic, isTauriRuntime } from "../../../services/tauriMediaService";

export function StoryItemSettings({ entry, onChange }: { entry: AlbumContent; onChange: (patch: Partial<AlbumContent>) => void }) {
  const [custom, setCustom] = useState(![3,5,8].includes(entry.displayDuration));
  return <details className="storyItemSettings"><summary>스토리 설정</summary>
    {!["VIDEO", "AUDIO"].includes(entry.kind) ? <>
      <label>표시 시간<select aria-label="표시 시간" value={custom ? "custom" : String(entry.displayDuration)} onChange={e => {
        setCustom(e.target.value === "custom"); if (e.target.value !== "custom") onChange({ displayDuration:Number(e.target.value) });
      }}><option value="3">3초</option><option value="5">5초</option><option value="8">8초</option><option value="custom">사용자 지정</option></select></label>
      {custom && <label>표시 시간(초)<input type="number" min={1} max={600} step="0.1" required value={entry.displayDuration} onChange={e => onChange({ displayDuration:Number(e.target.value) })} /></label>}
    </> : <p>재생이 끝나면 다음 기록으로 넘어갑니다.</p>}
    <label>전환 효과<select aria-label="전환 효과" value={entry.transitionType} onChange={e => onChange({ transitionType:e.target.value as AlbumContent["transitionType"] })}>
      <option value="fade">Fade · 서서히</option><option value="slide">Slide · 옆으로</option><option value="zoom">Zoom · 천천히 확대</option>
    </select></label>
    {entry.mediaId && <label><input type="checkbox" checked={entry.commentVisible} onChange={e => onChange({ commentVisible:e.target.checked })} />댓글·기록 표시</label>}
  </details>;
}

export function AlbumMusicSettings({ path, onChange }: { path?: string; onChange: (path: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function choose() {
    setBusy(true); setError("");
    try { const chosen = await chooseAlbumMusic(); if (chosen) onChange(chosen); }
    catch { setError("음악 파일을 선택하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <section className="albumMusicSettings" aria-label="배경 음악">
    <h3>스토리 배경 음악</h3><p>{path?.split(/[\\/]/).pop() || "음악 없이 감상"}</p>
    <div className="albumContentRowActions"><button type="button" disabled={busy || !isTauriRuntime()} onClick={() => void choose()}>음악 선택</button>
    {path && <button type="button" onClick={() => onChange("")}>음악 제거</button>}</div>
    {!isTauriRuntime() && <small>설치된 앱에서 음악 파일을 선택할 수 있습니다.</small>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
