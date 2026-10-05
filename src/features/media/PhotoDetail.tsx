import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Download, Heart, Minus, Plus, RotateCcw, Star, X, ZoomIn, ZoomOut } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { FavoriteBadge, getMediaSource, MediaImage } from "../../components/MediaVisual";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { MediaPlayback } from "../../components/MediaPlayback";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { formatJournalDate } from "./journalModel";
import { useMediaDownload } from "./useMediaDownload";
import { RegionEditor } from "../map/RegionEditor";

export function DetailModal({
  item,
  onChange,
  onSaveTitle,
  onAssignRegion,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaItem;
  onChange: (patch: Partial<MediaItem>) => void;
  onSaveTitle: (id: string, title: string) => Promise<void>;
  onAssignRegion: (ids: string[], region: string, district?: string, country?: string, city?: string) => Promise<void>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [zoomViewerOpen, setZoomViewerOpen] = useState(false);
  const mobile = useMobileLayout();
  const [photoZoom, setPhotoZoom] = useState(100);
  const dialogRef = useRef<HTMLElement>(null);
  const photoViewportRef = useRef<HTMLDivElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const previousZoom = useRef(100);
  const photoDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const mediaDownload = useMediaDownload(item);
  useModalBehavior(onClose, { onPrev, onNext });

  useEffect(() => {
    setZoomViewerOpen(false);
    setPhotoZoom(100);
    photoDrag.current = null;
  }, [item.id]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  useLayoutEffect(() => {
    const viewport = photoViewportRef.current;
    if (viewport) {
      // Keep the same part of the photo centered when the zoom level changes.
      const ratio = Math.max(100, photoZoom) / Math.max(100, previousZoom.current);
      viewport.scrollLeft = (viewport.scrollLeft + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2;
      viewport.scrollTop = (viewport.scrollTop + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2;
    }
    previousZoom.current = photoZoom;
  }, [photoZoom]);

  function changePhotoZoom(value: number) {
    setPhotoZoom(Math.max(25, Math.min(400, value)));
  }

  return (
    <div className="modalBackdrop photoLightboxBackdrop" role="presentation">
      <section ref={dialogRef} className="detailModal photoLightbox photoInspector" role="dialog" aria-modal="true" aria-label="사진 상세" tabIndex={-1} inert={zoomViewerOpen} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, video[controls], audio[controls]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}>
        <header className="detailHeader">
          <button className="detailBack" onClick={onClose} aria-label="이전 화면으로 돌아가기"><ChevronLeft size={20} /><span id="detailTitle">돌아가기</span></button>
          <span className="detailDateTitle">{formatJournalDate(item.takenAt)}</span>
          <button className="detailClose" title="닫기" onClick={onClose}><X size={18} /><span>닫기</span></button>
        </header>
        <div className="detailLayout">
          <div className="detailPhotoPane">
            <div className="detailPhotoActions" aria-label="사진 도구">
              <strong className="detailActionTitle">사진 작업</strong>
              <div className="detailActionButtons">
              <button className={item.favorite ? "detailFavorite active" : "detailFavorite"} title="즐겨찾기" aria-pressed={item.favorite} onClick={() => onChange({ favorite: !item.favorite })}>
                <Heart size={18} fill={item.favorite ? "currentColor" : "none"} /><span>즐겨찾기</span>
              </button>
              {item.fileType === "image" && <button ref={zoomTriggerRef} className="detailExpand" title="확대 보기" onClick={() => setZoomViewerOpen(true)}><ZoomIn size={18} /><span>확대 보기</span></button>}
              {item.fileType === "image" && <button title="원본 다운로드" aria-label="원본 다운로드" disabled={mediaDownload.busy || !mediaDownload.available} onClick={() => void mediaDownload.download()}><Download size={18} /><span>{mediaDownload.busy ? "저장 중" : "다운로드"}</span></button>}
              </div>
              {mediaDownload.error && <p className="detailDownloadFeedback" role="alert">{mediaDownload.error}</p>}
              {mediaDownload.notice && <p className="detailDownloadFeedback" role="status">{mediaDownload.notice}</p>}
            </div>
            <div className="detailStage">
              <FavoriteBadge item={item} />
              {item.fileType === "image" ? <>
                <div
                  key={item.id}
                  ref={photoViewportRef}
                  className={`detailImageViewport${photoZoom > 100 ? " canPan" : ""}`}
                  onPointerDown={(event) => {
                    if (photoZoom <= 100 || event.button !== 0) return;
                    const viewport = event.currentTarget;
                    photoDrag.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
                    viewport.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const origin = photoDrag.current;
                    if (!origin) return;
                    event.currentTarget.scrollLeft = origin.left - (event.clientX - origin.x);
                    event.currentTarget.scrollTop = origin.top - (event.clientY - origin.y);
                  }}
                  onPointerUp={(event) => {
                    photoDrag.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { photoDrag.current = null; }}
                  onLostPointerCapture={() => { photoDrag.current = null; }}
                >
                  <div className="detailImageCanvas" style={{ width: `${Math.max(100, photoZoom)}%`, height: `${Math.max(100, photoZoom)}%`, "--photo-scale": Math.min(1, photoZoom / 100) } as CSSProperties}>
                    <MediaImage item={item} original />
                  </div>
                </div>
              </> : <MediaPlayback key={`${item.id}:${item.filePath}:${item.previewUrl ?? ""}`} kind={item.fileType} fileName={item.fileName} source={getMediaSource(item)} />}
              <button className="photoNavButton prev" title="이전" onClick={onPrev}><ChevronLeft size={22} /></button>
              <button className="photoNavButton next" title="다음" onClick={onNext}><ChevronRight size={22} /></button>
            </div>
            {item.fileType === "image" && <div className="detailZoomControls" aria-label="사진 배율 조절">
              <button title="축소" aria-label="축소" disabled={photoZoom <= 25} onClick={() => changePhotoZoom(photoZoom - 25)}><Minus size={22} /></button>
              <input aria-label="사진 배율" type="range" min="25" max="400" step="25" value={photoZoom} onChange={(event) => changePhotoZoom(Number(event.target.value))} />
              <output aria-live="polite">{photoZoom}%</output>
              <button title="확대" aria-label="확대" disabled={photoZoom >= 400} onClick={() => changePhotoZoom(photoZoom + 25)}><Plus size={22} /></button>
              <button className="detailZoomReset" title="사진 전체에 맞추기" onClick={() => setPhotoZoom(100)}><RotateCcw size={18} /><span>화면에 맞춤</span></button>
            </div>}
          </div>
          <div className="detailSidebar">
            <aside className="photoInformation" aria-label="사진 정보">
              <h2>{item.fileType === "image" ? "사진 정보" : item.fileType === "video" ? "영상 정보" : "음성 정보"}</h2>
              <p className="detailFileName">{item.fileName}</p>
              <PhotoTitleEditor key={item.id} item={item} onSave={onSaveTitle} />
              {item.fileType !== "audio" && <RegionEditor key={`region-${item.id}`} current={item.regionCode} district={item.district} country={item.country} city={item.city} source={item.locationSource} status={item.locationStatus} onSave={(code, district, country, city) => onAssignRegion([item.id], code, district, country, city)} />}
              <section className="detailRating" aria-label="별점">
                <h3>별점</h3>
                <div className="rating">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button key={score} onClick={() => onChange({ rating: score })} title={`${score}점`} aria-pressed={item.rating === score}>
                      <Star size={28} fill={score <= item.rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
              </section>
              <dl className="photoMetadata">
                <div><dt>촬영일</dt><dd>{item.takenAt?.replaceAll("-", ".") ?? "날짜 없음"}</dd></div>
                {item.latitude != null && item.longitude != null && <div><dt>원본 GPS</dt><dd>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</dd></div>}
                {!mobile && <div><dt>해상도</dt><dd>{item.width && item.height ? `${item.width} × ${item.height}` : "-"}</dd></div>}
                {item.fileType !== "image" && <div><dt>재생 시간</dt><dd>{item.duration || "-"}</dd></div>}
                {!mobile && <><div><dt>파일 크기</dt><dd>{item.sizeLabel}</dd></div>
                <div><dt>조회 수</dt><dd>{item.viewCount ?? 0}회</dd></div></>}
              </dl>
            </aside>
          </div>
        </div>
      </section>
      {zoomViewerOpen && <PhotoZoomViewer item={item} onClose={() => { setZoomViewerOpen(false); requestAnimationFrame(() => zoomTriggerRef.current?.focus()); }} />}
    </div>
  );
}

function PhotoTitleEditor({ item, onSave }: { item: MediaItem; onSave: (id: string, title: string) => Promise<void> }) {
  const [draft, setDraft] = useState(item.title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  useEffect(() => { setDraft(item.title ?? ""); }, [item.title]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(""); setNotice("");
    try {
      await onSave(item.id, draft.trim());
      setDraft(draft.trim());
      setNotice("제목을 저장했습니다.");
    } catch {
      setError("제목을 저장하지 못했습니다. 입력한 제목은 화면에 남아 있습니다. 다시 저장해 주세요.");
    } finally { busy.current = false; setSaving(false); }
  }

  return <form className="photoTitleForm" onSubmit={(event) => void submit(event)}>
    <label htmlFor="photoTitleInput">제목</label>
    <div className="photoTitleControls">
      <input id="photoTitleInput" aria-label="사진 제목" type="text" maxLength={120} value={draft} disabled={saving}
        placeholder="이 순간에 제목을 붙여보세요"
        onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
        onChange={(event) => { setDraft(event.target.value); setError(""); setNotice(""); }} />
      <button type="submit" disabled={saving || draft.trim() === (item.title ?? "")} aria-label="사진 제목 저장">{saving ? "저장 중" : "저장"}</button>
    </div>
    {error && <p className="photoTitleError" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </form>;
}

function PhotoZoomViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  useModalBehavior(onClose);

  function changeScale(next: number) {
    setScale(Math.min(4, Math.max(1, Math.round(next * 10) / 10)));
  }

  return (
    <div className="photoZoomBackdrop" role="presentation">
      <section className="photoZoomViewer" role="dialog" aria-modal="true" aria-label="사진 확대 보기">
        <div className="photoZoomToolbar" aria-label="확대 배율 조절">
          <button title="축소" onClick={() => changeScale(scale - 0.25)} disabled={scale <= 1}><ZoomOut size={20} /></button>
          <input aria-label="확대 배율" type="range" min="1" max="4" step="0.1" value={scale} onChange={(event) => changeScale(Number(event.target.value))} />
          <output>{Math.round(scale * 100)}%</output>
          <button title="확대" onClick={() => changeScale(scale + 0.25)} disabled={scale >= 4}><ZoomIn size={20} /></button>
          <button className="photoZoomReset" title="100%로 복원" onClick={() => setScale(1)}><RotateCcw size={19} />100%로 복원</button>
          <button className="photoZoomClose" title="확대 보기 닫기" autoFocus onClick={onClose}><X size={20} /></button>
        </div>
        <div className="photoZoomStage">
          <FavoriteBadge item={item} />
          <button
            className="photoZoomCanvas"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
            title={scale < 4 ? "사진 확대" : "최대 배율"}
            onClick={() => changeScale(scale + 0.5)}
          >
            <MediaImage item={item} original />
          </button>
        </div>
      </section>
    </div>
  );
}
