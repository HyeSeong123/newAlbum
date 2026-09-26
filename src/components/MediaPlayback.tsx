import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, Music, RotateCcw } from "lucide-react";

export function MediaPlayback({ kind, fileName, source }: {
  kind: "video" | "audio";
  fileName: string;
  source: string | null;
}) {
  const player = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = player.current;
    return () => { element?.pause(); };
  }, [source, attempt, failed]);

  function handlePlayerKey(event: KeyboardEvent<HTMLMediaElement>) {
    // Native seeking must not move to another item in the surrounding viewer.
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
  }

  if (!source || failed) return <div className="mediaPlaybackError" role="status">
    <CircleAlert size={28} aria-hidden="true" />
    <strong>{kind === "video" ? "영상을" : "음원을"} 재생할 수 없습니다.</strong>
    <p>{source ? "파일 위치와 재생 가능한 형식인지 확인해 주세요." : "파일을 다시 가져온 뒤 열어 주세요."}</p>
    {source && <button type="button" onClick={() => { setFailed(false); setAttempt((current) => current + 1); }}><RotateCcw size={16} />다시 시도</button>}
  </div>;

  return <div className={`mediaPlayback ${kind}`}>
    {kind === "audio" && <><Music className="audioArtwork" size={42} aria-hidden="true" /><p className="audioFileName">{fileName}</p></>}
    {kind === "video"
      ? <video key={`${source}:${attempt}`} ref={(element) => { player.current = element; }} src={source} controls playsInline preload="metadata" aria-label={`${fileName} 영상 재생`} onError={() => setFailed(true)} onKeyDown={handlePlayerKey} />
      : <audio key={`${source}:${attempt}`} ref={(element) => { player.current = element; }} src={source} controls preload="metadata" aria-label={`${fileName} 음원 재생`} onError={() => setFailed(true)} onKeyDown={handlePlayerKey} />}
  </div>;
}
