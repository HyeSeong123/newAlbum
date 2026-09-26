import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type CSSProperties } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, Heart, MessageCircle, Minus, Plus, RotateCcw, Star, X, ZoomIn, ZoomOut } from "lucide-react";
import type { MediaItem } from "../../types/media";
import type { MediaComment } from "./mediaComments";
import { getMediaSource, MediaImage } from "../../components/MediaVisual";
import { MediaPlayback } from "../../components/MediaPlayback";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { formatJournalDate } from "./journalModel";

export function DetailModal({
  item,
  comments,
  commentError,
  onChange,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaItem;
  comments: MediaComment[];
  commentError?: string;
  onChange: (patch: Partial<MediaItem>) => void;
  onAddComment: (author: string, content: string) => boolean;
  onUpdateComment: (commentId: string, author: string, content: string) => boolean;
  onDeleteComment: (commentId: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [zoomViewerOpen, setZoomViewerOpen] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(100);
  const dialogRef = useRef<HTMLElement>(null);
  const photoViewportRef = useRef<HTMLDivElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const previousZoom = useRef(100);
  const photoDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingAuthor, setEditingAuthor] = useState("");
  const [editingContent, setEditingContent] = useState("");
  useModalBehavior(onClose, { onPrev, onNext });

  useEffect(() => {
    setCommentContent("");
    setEditingCommentId(null);
    setEditingAuthor("");
    setEditingContent("");
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

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const author = commentAuthor.trim();
    const content = commentContent.trim();
    if (!author || !content) return;
    if (onAddComment(author, content)) setCommentContent("");
  }

  function startEditComment(comment: MediaComment) {
    setEditingCommentId(comment.id);
    setEditingAuthor(comment.author);
    setEditingContent(comment.content);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingAuthor("");
    setEditingContent("");
  }

  function submitEditedComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCommentId) return;
    const author = editingAuthor.trim();
    const content = editingContent.trim();
    if (!author || !content) return;
    if (onUpdateComment(editingCommentId, author, content)) cancelEditComment();
  }

  return (
    <div className="modalBackdrop photoLightboxBackdrop" role="presentation">
      <section ref={dialogRef} className="detailModal photoLightbox photoInspector" role="dialog" aria-modal="true" aria-label="사진 상세" tabIndex={-1} inert={zoomViewerOpen} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, video[controls], audio[controls]') ?? []);
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
              <button className={item.favorite ? "detailFavorite active" : "detailFavorite"} title="즐겨찾기" aria-pressed={item.favorite} onClick={() => onChange({ favorite: !item.favorite })}>
                <Heart size={18} fill={item.favorite ? "currentColor" : "none"} /><span>즐겨찾기</span>
              </button>
              <button onClick={() => { commentInputRef.current?.focus(); commentInputRef.current?.scrollIntoView({ block: "nearest" }); }}><MessageCircle size={18} /><span>댓글 {comments.length}</span></button>
              {item.fileType === "image" && <button ref={zoomTriggerRef} className="detailExpand" title="확대 보기" onClick={() => setZoomViewerOpen(true)}><ZoomIn size={18} /><span>확대 보기</span></button>}
            </div>
            <div className="detailStage">
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
                <div><dt>해상도</dt><dd>{item.width && item.height ? `${item.width} × ${item.height}` : "-"}</dd></div>
                {item.fileType !== "image" && <div><dt>재생 시간</dt><dd>{item.duration || "-"}</dd></div>}
                <div><dt>파일 크기</dt><dd>{item.sizeLabel}</dd></div>
                <div><dt>조회 수</dt><dd>{item.viewCount ?? 0}회</dd></div>
              </dl>
            </aside>
            <aside className="detailBody" aria-label="댓글">
              <section id="photoComments" className="commentBox">
                {commentError && <p role="alert">{commentError}</p>}
                <h2><MessageCircle size={25} /><span>댓글 {comments.length}</span></h2>
                <div className="commentList">
                  {!comments.length && <p>아직 남긴 댓글이 없습니다.</p>}
                  {comments.map((comment) => (
                    <article key={comment.id} className="commentItem">
                      {editingCommentId === comment.id ? (
                        <form className="commentEditForm" onSubmit={submitEditedComment}>
                          <label>
                            <span>작성자</span>
                            <input value={editingAuthor} onChange={(event) => setEditingAuthor(event.target.value)} placeholder="이름" />
                          </label>
                          <label>
                            <span>내용</span>
                            <textarea value={editingContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEditingContent(event.target.value)} placeholder="이 사진에 대한 이야기를 남겨보세요." />
                          </label>
                          <div className="commentEditActions">
                            <button type="submit" disabled={!editingAuthor.trim() || !editingContent.trim()}><CheckSquare size={16} />저장</button>
                            <button type="button" onClick={cancelEditComment}><X size={16} />취소</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <span className="commentAvatar" aria-hidden="true">{Array.from(comment.author.trim())[0] || "나"}</span>
                          <div className="commentItemHeading">
                            <strong>{comment.author}</strong>
                            {comment.createdAt && <time dateTime={comment.createdAt}>{formatDateTimeKo(comment.createdAt)}</time>}
                            <div className="commentActions">
                              <button title="댓글 수정" onClick={() => startEditComment(comment)}>수정</button>
                              <button title="댓글 삭제" onClick={() => onDeleteComment(comment.id)}>삭제</button>
                            </div>
                          </div>
                          <p>{comment.content}</p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
                <form className="commentForm" onSubmit={submitComment}>
                  <label>
                    <span>작성자</span>
                    <input value={commentAuthor} onChange={(event) => setCommentAuthor(event.target.value)} placeholder="이름" />
                  </label>
                  <label>
                    <span>내용</span>
                    <textarea ref={commentInputRef} value={commentContent} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCommentContent(event.target.value)} placeholder="이 사진에 대한 이야기를 남겨보세요." />
                  </label>
                  <button type="submit" disabled={!commentAuthor.trim() || !commentContent.trim()}>댓글 등록</button>
                </form>
              </section>
            </aside>
          </div>
        </div>
      </section>
      {zoomViewerOpen && <PhotoZoomViewer item={item} onClose={() => { setZoomViewerOpen(false); requestAnimationFrame(() => zoomTriggerRef.current?.focus()); }} />}
    </div>
  );
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
          <button title="100%로 복원" onClick={() => setScale(1)}><RotateCcw size={19} /></button>
          <button className="photoZoomClose" title="확대 보기 닫기" autoFocus onClick={onClose}><X size={20} /></button>
        </div>
        <div className="photoZoomStage">
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

function formatDateTimeKo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
