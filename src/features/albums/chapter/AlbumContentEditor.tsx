import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, FileText, Image, Plus, Trash2 } from "lucide-react";
import type { AlbumContent, MediaItem } from "../../../types/media";
import { moveContent, writtenPage } from "../albumContent";
import { MediaVisual } from "../../../components/MediaVisual";
import "./written-page.css";

const PAGE_SIZE = 20;

export function AlbumContentEditor({ contents, items, onChange, selectedId, onSelect }: {
  contents: AlbumContent[];
  items: MediaItem[];
  onChange: (entries: AlbumContent[]) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [position, setPosition] = useState(contents.length);
  const [offset, setOffset] = useState(0);
  const start = Math.min(offset, Math.max(0, Math.floor((contents.length - 1) / PAGE_SIZE) * PAGE_SIZE));
  const byId = new Map(items.map(item => [item.id, item]));
  const label = (entry: AlbumContent) => entry.mediaId
    ? byId.get(entry.mediaId)?.title || byId.get(entry.mediaId)?.fileName || "사진"
    : entry.title.trim() || (entry.kind === "CHAPTER" ? "새 챕터" : "새 감상문");
  const activeIndex = Math.max(0, contents.findIndex(entry => entry.id === selectedId));
  const active = contents[activeIndex];
  const edit = (patch: Partial<AlbumContent>) => onChange(contents.map(entry => entry.id === active.id ? { ...entry, ...patch } : entry));

  useEffect(() => {
    const index = contents.findIndex(entry => entry.id === selectedId);
    if (index >= 0) setOffset(Math.floor(index / PAGE_SIZE) * PAGE_SIZE);
  }, [selectedId]);

  function select(index: number) {
    onSelect(contents[index].id);
    setPosition(index + 1);
  }
  function add(kind: "CHAPTER" | "TEXT") {
    const at = Math.min(position, contents.length);
    const entry = writtenPage(kind);
    onChange([...contents.slice(0, at), entry, ...contents.slice(at)]);
    onSelect(entry.id);
    setOffset(Math.floor(at / PAGE_SIZE) * PAGE_SIZE);
    setPosition(at + 1);
    requestAnimationFrame(() => document.getElementById(`page-title-${entry.id}`)?.focus());
  }
  function move(target: number) {
    onChange(moveContent(contents, activeIndex, target));
    setOffset(Math.floor(target / PAGE_SIZE) * PAGE_SIZE);
    setPosition(target + 1);
  }
  function remove() {
    onChange(contents.filter(entry => entry.id !== active.id));
    const next = contents[activeIndex + 1] ?? contents[activeIndex - 1];
    if (next) onSelect(next.id);
    setPosition(Math.min(activeIndex, contents.length - 1));
    setOffset(Math.floor(Math.max(0, Math.min(activeIndex, contents.length - 2)) / PAGE_SIZE) * PAGE_SIZE);
  }

  return <section className="albumContentEditor" aria-label="앨범 구성">
    <div className="albumContentIntro"><h3>챕터와 감상문</h3><p>왼쪽 목차에서 위치를 고르고, 오른쪽에서 내용을 편집하세요. 저장하면 앨범의 책장과 목록에 반영됩니다.</p></div>
    <div className="albumContentToolbar">
      <label>추가 위치<select aria-label="삽입 위치" value={Math.min(position, contents.length)} onChange={event => setPosition(Number(event.target.value))}>
        <option value={0}>앨범 맨 앞</option>
        {contents.map((entry, i) => <option key={entry.id} value={i + 1}>{i + 1}. {label(entry)} 뒤</option>)}
      </select></label>
      <button type="button" onClick={() => add("CHAPTER")}><Plus size={17} />챕터 추가</button>
      <button type="button" className="albumAddWriting" onClick={() => add("TEXT")}><Plus size={17} />감상문 추가</button>
    </div>
    <div className="albumContentWorkspace">
      <div className="albumOutline" aria-label="앨범 목차">
        <div className="albumOutlineHead"><strong>앨범 목차</strong><span>{contents.length}개 항목</span></div>
        {!contents.length && <p className="albumOutlineEmpty">아직 내용이 없습니다. 위에서 챕터나 감상문을 추가해 보세요.</p>}
        <ol className="albumContentRows" start={start + 1}>
          {contents.slice(start, start + PAGE_SIZE).map((entry, localIndex) => {
            const index = start + localIndex;
            const item = entry.mediaId ? byId.get(entry.mediaId) : undefined;
            return <li key={entry.id} className={`albumContentRow kind-${entry.kind.toLowerCase()}`} data-content-id={entry.id}>
              <button type="button" className="albumOutlineItem" aria-current={active?.id === entry.id ? "true" : undefined} onClick={() => select(index)}>
                <span className="albumOutlineNumber">{index + 1}</span>
                <span className="albumOutlineThumb">{item ? <MediaVisual item={item} /> : entry.kind === "CHAPTER" ? <BookOpen size={22} /> : <FileText size={22} />}</span>
                <span className="albumOutlineText"><small>{entry.kind === "CHAPTER" ? "챕터" : entry.kind === "TEXT" ? "감상문" : "사진·영상"}</small><strong>{label(entry)}</strong></span>
              </button>
            </li>;
          })}
        </ol>
        {contents.length > PAGE_SIZE && <div className="albumOutlinePager">
          <button type="button" disabled={start === 0} onClick={() => setOffset(start - PAGE_SIZE)}>이전</button>
          <span>{start + 1}–{Math.min(start + PAGE_SIZE, contents.length)} / {contents.length}</span>
          <button type="button" disabled={start + PAGE_SIZE >= contents.length} onClick={() => setOffset(start + PAGE_SIZE)}>다음</button>
        </div>}
      </div>
      <div className="albumEntryEditor" aria-label="선택한 항목 편집">
        {active ? <>
          <div className="albumEntryHeader">
            <div><small>{activeIndex + 1}번째 · {active.kind === "CHAPTER" ? "챕터" : active.kind === "TEXT" ? "감상문" : "사진·영상"}</small><h4>{label(active)}</h4></div>
            <div className="albumEntryActions">
              <button type="button" aria-label={`${activeIndex + 1}번 항목 위로`} title="위로 이동" disabled={activeIndex === 0} onClick={() => move(activeIndex - 1)}><ArrowUp size={18} />위로</button>
              <button type="button" aria-label={`${activeIndex + 1}번 항목 아래로`} title="아래로 이동" disabled={activeIndex === contents.length - 1} onClick={() => move(activeIndex + 1)}><ArrowDown size={18} />아래로</button>
              <button type="button" className="albumEntryDelete" aria-label={`${activeIndex + 1}번 항목 삭제`} title={active.mediaId ? "앨범에서 제거" : "항목 삭제"} onClick={remove}><Trash2 size={18} />{active.mediaId ? "앨범에서 제거" : "삭제"}</button>
            </div>
          </div>
          {active.mediaId ? <p className="albumEntryHint"><Image size={17} />사진의 제목과 설명은 사진 상세 화면에서 수정할 수 있습니다. 이곳에서는 앨범에 담을 순서를 바꿀 수 있어요.</p> : <div className="albumWritingFields">
            <label htmlFor={`page-title-${active.id}`}>{active.kind === "CHAPTER" ? "챕터 제목" : "감상문 제목"}<input id={`page-title-${active.id}`} maxLength={120} value={active.title} placeholder={active.kind === "CHAPTER" ? "예: 첫 번째 여행" : "예: 오래 기억하고 싶은 하루"} onChange={event => edit({ title: event.target.value })} /></label>
            <label htmlFor={`page-body-${active.id}`}>{active.kind === "CHAPTER" ? "부제목 또는 설명" : "감상문 내용"}<textarea id={`page-body-${active.id}`} aria-label={active.kind === "CHAPTER" ? "부제목 또는 설명" : "감상문 내용"} maxLength={4000} value={active.body} placeholder={active.kind === "CHAPTER" ? "이 장면을 소개하는 짧은 글을 적어보세요." : "이때 느꼈던 마음과 기억을 편하게 적어보세요."} onChange={event => edit({ body: event.target.value })} /></label>
            <small className="albumWritingCount">{active.body.length} / 4,000자</small>
          </div>}
        </> : <div className="albumEntryEmpty"><BookOpen size={32} /><p>목차에서 편집할 항목을 선택하세요.</p></div>}
      </div>
    </div>
  </section>;
}
