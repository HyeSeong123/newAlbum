import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import type { AlbumContent, MediaItem } from "../../../types/media";
import { moveContent } from "../albumContent";
import { MediaVisual } from "../../../components/MediaVisual";
import "./written-page.css";

const PAGE_SIZE = 20;

export function AlbumContentEditor({ contents, items, onChange, selectedId }: {
  contents: AlbumContent[];
  items: MediaItem[];
  onChange: (entries: AlbumContent[]) => void;
  selectedId: string;
}) {
  const activeIndex = contents.findIndex(entry => entry.id === selectedId);
  const active = contents[activeIndex];
  const [offset, setOffset] = useState(Math.floor(Math.max(0, activeIndex - 1) / PAGE_SIZE) * PAGE_SIZE);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOffset(Math.floor(Math.max(0, activeIndex - 1) / PAGE_SIZE) * PAGE_SIZE);
  }, [activeIndex]);
  useEffect(() => {
    rail.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeIndex, offset]);
  const anchors = contents.filter(entry => entry.id !== selectedId);
  const start = Math.min(offset, Math.max(0, Math.floor((anchors.length - 1) / PAGE_SIZE) * PAGE_SIZE));
  const byId = new Map(items.map(item => [item.id, item]));
  const label = (entry: AlbumContent) => entry.mediaId
    ? byId.get(entry.mediaId)?.title || byId.get(entry.mediaId)?.fileName || "사진"
    : entry.title.trim() || (entry.kind === "CHAPTER" ? "새 챕터" : "새 편지");
  if (!active) return <p>이 기록을 찾을 수 없습니다. 앨범으로 돌아가 다시 열어 주세요.</p>;
  const name = active.kind === "CHAPTER" ? "챕터" : "편지";
  const edit = (patch: Partial<AlbumContent>) => onChange(contents.map(entry => entry.id === selectedId ? { ...entry, ...patch } : entry));
  const position = (target: number) => onChange(moveContent(contents, activeIndex, target));

  return <section className="albumContentEditor" aria-label={`${name} 작성`}>
    <div className="albumContentToolbar">
      <label>추가 위치<select aria-label="삽입 위치" value={activeIndex} onChange={event => position(Number(event.target.value))}>
        <option value={0}>앨범 맨 앞</option>
        {anchors.map((entry, index) => <option key={entry.id} value={index + 1}>{index + 1}. {label(entry)} 뒤</option>)}
      </select></label>
    </div>
      <section className="albumOutline" aria-label="앨범 장 선택">
        <div className="albumOutlineHead"><strong>앨범 장 선택</strong><span>좌우로 넘겨 위치를 골라요</span></div>
        <div className="albumPositionRail" ref={rail}>
        <button type="button" className="albumOutlineItem albumPositionFirst" aria-pressed={activeIndex === 0} onClick={() => position(0)}><BookOpen size={25} aria-hidden="true" /><strong>앨범 맨 앞</strong></button>
        <ol className="albumContentRows" start={start + 1}>
          {anchors.slice(start, start + PAGE_SIZE).map((entry, localIndex) => {
            const index = start + localIndex;
            const item = entry.mediaId ? byId.get(entry.mediaId) : undefined;
            return <li key={entry.id} className={`albumContentRow kind-${entry.kind.toLowerCase()}`} data-content-id={entry.id}>
              <button type="button" className="albumOutlineItem" aria-pressed={activeIndex === index + 1} aria-label={`${index + 1}. ${label(entry)} 뒤에 추가`} onClick={() => position(index + 1)}>
                <span className="albumOutlineNumber">{index + 1}</span>
                <span className="albumOutlineThumb">{item ? <MediaVisual item={item} /> : entry.kind === "CHAPTER" ? <BookOpen size={22} /> : <FileText size={22} />}</span>
                <span className="albumOutlineText"><small>{entry.kind === "CHAPTER" ? "챕터" : entry.kind === "TEXT" ? "편지" : "사진·영상"}</small><strong>{label(entry)}</strong></span>
              </button>
            </li>;
          })}
        </ol>
        </div>
        {anchors.length > PAGE_SIZE && <div className="albumOutlinePager">
          <button type="button" disabled={start === 0} onClick={() => setOffset(start - PAGE_SIZE)}>이전</button>
          <span>{start + 1}–{Math.min(start + PAGE_SIZE, anchors.length)} / {anchors.length}</span>
          <button type="button" disabled={start + PAGE_SIZE >= anchors.length} onClick={() => setOffset(start + PAGE_SIZE)}>다음</button>
        </div>}
      </section>
    <div className="albumContentWorkspace">
      <div className="albumEntryEditor" aria-label={`${name} 내용 편집`}>
        <div className="albumWritingFields">
          <div className="albumWritingField"><label htmlFor={`page-title-${active.id}`}>{name} 제목</label><input id={`page-title-${active.id}`} maxLength={120} value={active.title} placeholder={active.kind === "CHAPTER" ? "예: 첫 번째 여행" : "예: 오래 기억하고 싶은 하루"} onChange={event => edit({ title: event.target.value })} /></div>
          <div className="albumWritingField"><label htmlFor={`page-body-${active.id}`}>{active.kind === "CHAPTER" ? "부제목 또는 설명" : "편지 내용"}</label><textarea id={`page-body-${active.id}`} maxLength={4000} value={active.body} placeholder={active.kind === "CHAPTER" ? "이 장면을 소개하는 짧은 글을 적어보세요." : "이때 느꼈던 마음과 기억을 편하게 적어보세요."} onChange={event => edit({ body: event.target.value })} /></div>
          <small className="albumWritingCount">{active.body.length} / 4,000자</small>
        </div>
      </div>

    </div>
  </section>;
}
