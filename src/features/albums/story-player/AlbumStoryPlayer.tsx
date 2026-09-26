import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import type { AlbumContent, MediaItem } from "../../../types/media";
import { getMediaSource } from "../../../components/MediaVisual";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
import { getMediaComments, loadMediaComments } from "../../media/mediaComments";
import { adjacentPhotos, albumDateRange, storyScenes, type StoryScene } from "./storyModel";
import "./story-player.css";

export function AlbumStoryPlayer({ title, items, contents, musicPath, onClose }: {
  title: string; items: MediaItem[]; contents?: AlbumContent[]; musicPath?: string; onClose: () => void;
}) {
  const scenes = useMemo(() => storyScenes({ items, contents }), [items, contents]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [notice, setNotice] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const music = useRef<HTMLAudioElement>(null);
  const [comments] = useState(loadMediaComments);
  const scene = scenes[index];
  const musicSource = musicPath ? getMediaSource({ filePath:musicPath }) : null;

  function go(next: number) {
    if (next < 0 || next >= scenes.length) return;
    setIndex(next); setFinished(false); setNotice(""); setEpoch(value => value + 1);
  }
  function advance() {
    if (index + 1 < scenes.length) go(index + 1);
    else { setPlaying(false); setFinished(true); }
  }
  function togglePlay() {
    if (!scenes.length) return;
    if (index < 0 || finished) go(0);
    setPlaying(value => !value);
  }
  useModalBehavior(onClose, { onPrev:() => go(index - 1), onNext:() => go(index + 1) });

  useEffect(() => {
    const images = adjacentPhotos(scenes, index).map(item => {
      const image = new Image(); const source = getMediaSource(item); if (source) image.src = source; return image;
    });
    return () => images.forEach(image => { image.removeAttribute("src"); });
  }, [scenes, index]);
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pauseHidden);
    const node = root.current;
    const sync = () => setFullscreen(document.fullscreenElement === node);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("visibilitychange", pauseHidden);
      document.removeEventListener("fullscreenchange", sync);
      if (node && document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const audio = music.current;
    if (!audio) return;
    let active = true;
    audio.volume = scene?.media && scene.media.fileType !== "image" ? 0.15 : 0.5;
    if (playing) void audio.play().catch(() => { if (active) setNotice("배경 음악을 재생하지 못했습니다. 음악 파일 위치와 형식을 확인해 주세요."); });
    else audio.pause();
    return () => { active = false; };
  }, [playing, musicSource, scene?.media?.fileType]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch { setNotice("전체화면으로 전환하지 못했습니다."); }
  }
  return <section className="albumStoryPlayer" ref={root} role="dialog" aria-modal="true" aria-label="앨범 스토리">
    <header className="storyHeader"><strong>{title}</strong><button onClick={onClose} aria-label="스토리 종료"><X size={20} />종료</button></header>
    <div className="storyStage">
      {scene ? <StoryFrame key={`${index}-${epoch}`} scene={scene} playing={playing} onPlaying={setPlaying} onEnded={advance}
        showTitle={showTitle} showDate={showDate} comments={showComments && scene.entry.commentVisible && scene.media ? getMediaComments(scene.media, comments).map(comment => `${comment.author}: ${comment.content}`).join("\n") : ""} />
        : <div className="storyIntro"><span>오래 담아둔 순간들</span><h1>{title}</h1><p>{albumDateRange(items)}</p><p>{scenes.length ? "재생을 눌러 추억을 감상하세요." : "앨범에 담긴 기록이 없습니다."}</p></div>}
    </div>
    {musicSource && <audio ref={music} className="storyMusic" src={musicSource} loop muted={muted} preload="metadata" onError={() => setNotice("배경 음악 파일을 열 수 없습니다. 앨범 수정에서 다시 선택해 주세요.")} />}
    <footer className="storyFooter">
      {notice && <p role="status">{notice}</p>}
      {finished && <p role="status">마지막 기록입니다. 다시 재생할 수 있습니다.</p>}
      <div className="storyControls">
        <button onClick={() => go(index - 1)} disabled={index <= 0} aria-label="이전 기록"><ChevronLeft /></button>
        <button onClick={togglePlay} disabled={!scenes.length} aria-label={playing ? "일시정지" : finished ? "다시 재생" : "재생"}>{playing ? <Pause /> : <Play />}<span>{playing ? "일시정지" : "재생"}</span></button>
        <button onClick={() => go(index + 1)} disabled={index >= scenes.length - 1} aria-label="다음 기록"><ChevronRight /></button>
        <output aria-label="스토리 진행 상태">{Math.max(0, index + 1)} / {scenes.length}</output>
        <button onClick={() => setMuted(value => !value)} disabled={!musicSource} aria-pressed={muted} aria-label="음악 음소거">{muted ? <VolumeX /> : <Volume2 />}</button>
        <button onClick={() => void toggleFullscreen()} disabled={!document.fullscreenEnabled} aria-pressed={fullscreen} aria-label="스토리 전체화면"><Maximize /></button>
      </div>
      <input type="range" aria-label="스토리 위치" min={0} max={Math.max(0, scenes.length - 1)} value={Math.max(0, index)} disabled={!scenes.length} onChange={e => go(Number(e.target.value))} />
      <div className="storyCaptionOptions"><label><input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />사진 제목</label><label><input type="checkbox" checked={showDate} onChange={e => setShowDate(e.target.checked)} />촬영 날짜</label><label><input type="checkbox" checked={showComments} onChange={e => setShowComments(e.target.checked)} />댓글·기록</label></div>
    </footer>
  </section>;
}

function StoryFrame({ scene, playing, onPlaying, onEnded, showTitle, showDate, comments }: {
  scene: StoryScene; playing: boolean; onPlaying: (playing: boolean) => void; onEnded: () => void;
  showTitle: boolean; showDate: boolean; comments: string;
}) {
  const { entry, media } = scene;
  const source = media ? getMediaSource(media) : null;
  const timed = !media || media.fileType === "image";
  const [ready, setReady] = useState(!media);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const player = useRef<HTMLMediaElement | null>(null);
  const ended = useRef(onEnded); ended.current = onEnded;
  const changePlaying = useRef(onPlaying); changePlaying.current = onPlaying;
  const duration = entry.displayDuration * 1000;
  useEffect(() => {
    if (!timed || !playing || !ready || error) return;
    const start = performance.now(); const before = elapsedRef.current;
    const timer = window.setInterval(() => {
      const now = Math.min(duration, before + performance.now() - start);
      setElapsed(now);
      if (now >= duration) { clearInterval(timer); ended.current(); }
    }, 100);
    return () => { clearInterval(timer); elapsedRef.current = Math.min(duration, before + performance.now() - start); };
  }, [timed, playing, ready, error, duration]);
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    let active = true;
    if (playing) void element.play().catch(() => {
      if (active) { setError("재생할 수 없습니다. 파일 위치·형식을 확인하거나 다음 기록으로 이동해 주세요."); changePlaying.current(false); }
    }); else element.pause();
    return () => { active = false; };
  }, [playing]);
  function fail() { setError("파일을 열 수 없습니다. 다음 기록으로 이동하거나 파일 위치를 확인해 주세요."); onPlaying(false); }
  const playback = {
    src:source ?? undefined, controls:true, preload:"metadata", onEnded,
    onError:fail, onPlay:() => { setError(""); onPlaying(true); },
    onPause:() => { if (player.current && !player.current.ended && document.contains(player.current)) onPlaying(false); },
    onTimeUpdate:() => setElapsed(player.current?.currentTime ?? 0),
  };
  return <article className={`storyFrame transition-${entry.transitionType}`} data-kind={entry.kind}>
    {media ? <>
      {source ? media.fileType === "image" ? <img className="storyPhoto" src={source} alt={media.title || media.fileName} onLoad={() => setReady(true)} onError={fail} />
        : media.fileType === "video" ? <video className="storyVideo" aria-label={`${media.title || media.fileName} 영상 재생`} ref={node => { player.current = node; }} playsInline {...playback} />
          : <div className="storyAudio"><h2>{media.title || media.fileName}</h2><audio aria-label={`${media.title || media.fileName} 음원 재생`} ref={node => { player.current = node; }} {...playback} /></div>
        : <p role="alert">파일 경로를 찾을 수 없습니다. 다음 기록으로 이동해 주세요.</p>}
      <div className="storyCaption">
        {showTitle && media.title && <h2>{media.title}</h2>}
        {showDate && media.takenAt && <time>{media.takenAt.slice(0, 10).replaceAll("-", ".")}</time>}
        {comments && <p>{comments}</p>}
      </div>
    </> : <div className={`storyWritten kind-${entry.kind.toLowerCase()}`}><span>{entry.kind === "CHAPTER" ? "CHAPTER" : "JOURNAL"}</span><h2>{entry.title}</h2><p>{entry.body}</p></div>}
    {error && <p className="storyError" role="alert">{error}</p>}
    <progress className="storySceneProgress" aria-label="현재 기록 진행" max={timed ? duration : player.current?.duration || 1} value={elapsed} />
  </article>;
}
