import { useState } from "react";
import type { AlbumContent, MediaItem } from "../../../types/media";
import { moveContent, writtenPage } from "../albumContent";
import "./written-page.css";
import { StoryItemSettings } from "../story-player/StorySettings";

export function AlbumContentEditor({ contents, items, onChange }: {
  contents: AlbumContent[]; items: MediaItem[]; onChange: (entries: AlbumContent[]) => void;
}) {
  const [position, setPosition] = useState(0);
  const [offset, setOffset] = useState(0);
  const start = Math.min(offset, Math.max(0, Math.floor((contents.length - 1) / 20) * 20));
  const labels = new Map(items.map(item => [item.id, item.title || item.fileName]));
  const label = (entry: AlbumContent) => entry.mediaId ? labels.get(entry.mediaId) ?? "미디어" : entry.title || "제목 없음";
  const edit = (index: number, patch: Partial<AlbumContent>) => onChange(contents.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  function add(kind: "CHAPTER" | "TEXT") {
    const at = Math.min(position, contents.length);
    onChange([...contents.slice(0, at), writtenPage(kind), ...contents.slice(at)]);
    setOffset(Math.floor(at / 20) * 20); setPosition(at + 1);
  }
  return <section className="albumContentEditor" aria-label="앨범 구성">
    <h3>앨범 구성</h3>
    <div className="albumContentToolbar">
      <label>삽입 위치<select value={Math.min(position, contents.length)} onChange={event => setPosition(Number(event.target.value))}>
        <option value={0}>맨 앞</option>
        {contents.map((entry, i) => <option key={entry.id} value={i + 1}>{i + 1}. {label(entry)} 뒤</option>)}
      </select></label>
      <button type="button" onClick={() => add("CHAPTER")}>챕터 추가</button>
      <button type="button" onClick={() => add("TEXT")}>글 페이지 추가</button>
    </div>
    <ol className="albumContentRows" start={start + 1}>
      {contents.slice(start, start + 20).map((entry, localIndex) => {
        const index = start + localIndex;
        return <li key={entry.id} className={`albumContentRow kind-${entry.kind.toLowerCase()}`} data-content-id={entry.id}>
          <strong>{index + 1}. {entry.kind === "CHAPTER" ? "챕터" : entry.kind === "TEXT" ? "글 페이지" : label(entry)}</strong>
          {!entry.mediaId && <>
            <div><label htmlFor={`page-title-${entry.id}`}>{entry.kind === "CHAPTER" ? "챕터 제목" : "글 제목"}</label><input id={`page-title-${entry.id}`} required={entry.kind === "CHAPTER"} maxLength={120} value={entry.title} onChange={event => edit(index, { title: event.target.value })} /></div>
            <div><label htmlFor={`page-body-${entry.id}`}>{entry.kind === "CHAPTER" ? "부제목 또는 설명" : "본문"}</label><textarea id={`page-body-${entry.id}`} required={entry.kind === "TEXT" && !entry.title.trim()} maxLength={4000} value={entry.body} onChange={event => edit(index, { body: event.target.value })} /></div>
          </>}
          <StoryItemSettings entry={entry} onChange={patch => edit(index, patch)} />
          <div className="albumContentRowActions">
            <button type="button" aria-label={`${index + 1}번 항목 위로`} disabled={index === 0} onClick={() => { onChange(moveContent(contents, index, index - 1)); setOffset(Math.floor((index - 1) / 20) * 20); }}>위로</button>
            <button type="button" aria-label={`${index + 1}번 항목 아래로`} disabled={index === contents.length - 1} onClick={() => { onChange(moveContent(contents, index, index + 1)); setOffset(Math.floor((index + 1) / 20) * 20); }}>아래로</button>
            <button type="button" aria-label={`${index + 1}번 항목 삭제`} onClick={() => onChange(contents.filter((_, i) => i !== index))}>삭제</button>
          </div>
        </li>;
      })}
    </ol>
    {contents.length > 20 && <div className="albumContentRowActions">
      <button type="button" disabled={start === 0} onClick={() => setOffset(start - 20)}>이전 항목</button>
      <span>{start + 1}–{Math.min(start + 20, contents.length)} / {contents.length}</span>
      <button type="button" disabled={start + 20 >= contents.length} onClick={() => setOffset(start + 20)}>다음 항목</button>
    </div>}
  </section>;
}
