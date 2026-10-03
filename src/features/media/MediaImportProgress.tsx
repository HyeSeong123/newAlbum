import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, LoaderCircle } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import type { MediaImportProgress as Progress } from "./importProgress";
import "./mediaImportProgress.css";

const phaseLabels: Record<Progress["phase"], string> = {
  selecting: "파일 선택을 기다리고 있어요",
  scanning: "사진과 영상을 찾고 있어요",
  registering: "사진과 영상을 가져오고 있어요",
  region: "촬영 지역을 저장하고 있어요",
  album: "앨범에 추억을 담고 있어요",
  finishing: "가져온 기록을 정리하고 있어요",
  recovering: "가져온 기록을 확인하고 있어요",
};

function sizeLabel(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function MediaImportProgress({ progress }: { progress: Progress }) {
  const panel = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useModalBehavior(() => {});
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.app");
    const previousInert = root?.inert ?? false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (root) root.inert = true;
    panel.current?.focus();
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearInterval(timer);
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const determinate = progress.phase === "registering" && progress.total > 0;
  const ratio = progress.totalBytes ? (progress.bytesProcessed ?? 0) / progress.totalBytes : progress.processed / Math.max(1, progress.total);
  const percentage = Math.max(0, Math.min(100, Math.floor(ratio * 100)));
  return createPortal(
    <div className="mediaImportScreen">
      <div ref={panel} className="mediaImportCard" role="dialog" aria-modal="true" aria-busy="true" aria-labelledby="mediaImportProgressTitle" tabIndex={-1}
        onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); panel.current?.focus(); } }}>
        <div className="mediaImportIllustration" aria-hidden="true"><Images size={38} /><LoaderCircle className="mediaImportSpinner" size={86} /></div>
        <span className="mediaImportEyebrow">추억을 담는 중</span>
        <h2 id="mediaImportProgressTitle">사진·영상 가져오는 중</h2>
        <p className="mediaImportPhase" role="status" aria-live="polite">{phaseLabels[progress.phase]}</p>
        <div className="mediaImportTrack" role="progressbar" aria-label="사진·영상 가져오기 진행률"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={determinate ? percentage : undefined}>
          <span className={determinate ? "" : "indeterminate"} style={determinate ? { width: `${percentage}%` } : undefined} />
        </div>
        <div className="mediaImportCounts">
          <span>{progress.phase === "scanning" ? `찾은 파일 ${progress.total.toLocaleString()}개` : progress.total > 0 ? `처리한 파일 ${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()}개` : "잠시만 기다려 주세요"}</span>
          <span>{determinate ? `${percentage}%` : <LoaderCircle className="mediaImportSmallSpinner" size={16} aria-hidden="true" />}</span>
        </div>
        {progress.totalBytes ? <p className="mediaImportBytes">읽은 용량 {sizeLabel(progress.bytesProcessed ?? 0)} / {sizeLabel(progress.totalBytes)}</p> : null}
        {progress.fileName && <p className="mediaImportFile" title={progress.fileName}>{progress.fileName}</p>}
        <p className="mediaImportHint">대용량 파일은 시간이 걸릴 수 있어요.<br />작업을 마치면 자동으로 닫힙니다.</p>
        {elapsed > 0 && <span className="mediaImportElapsed">{Math.floor(elapsed / 60) > 0 ? `${Math.floor(elapsed / 60)}분 ` : ""}{elapsed % 60}초 경과</span>}
      </div>
    </div>, document.body,
  );
}
