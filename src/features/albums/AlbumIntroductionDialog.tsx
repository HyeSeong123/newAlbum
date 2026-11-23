import { useEffect, useRef } from "react";
import { useModalBehavior } from "../../hooks/useModalBehavior";

export function AlbumIntroductionDialog({ albumTitle, characterName, content, onClose }: {
  albumTitle: string;
  characterName: string | null;
  content: { sections: string[]; hasStory: boolean };
  onClose: () => void;
}) {
  useModalBehavior(onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="albumIntroBackdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="albumIntroDialog" role="dialog" aria-modal="true" aria-labelledby="albumIntroTitle" aria-describedby="albumIntroDescription">
      <h2 id="albumIntroTitle">{characterName ? `${characterName}에게 앨범 소개하기` : "앨범 소개 준비"}</h2>
      <p id="albumIntroDescription">‘{albumTitle}’ 앨범에서 아래 글을 읽을 수 있어요. 사진 이미지는 분석하지 않아요.</p>
      {content.hasStory ? <div className="albumIntroPreview" aria-label="소개할 앨범 내용">{content.sections.map((section, index) => <p key={index}>{section}</p>)}</div>
        : <p>앨범에 사진 설명이나 챕터, 편지를 작성하면 이야기를 소개할 수 있어요.</p>}
      <p role="status">{!characterName ? "대표 친구를 선택한 뒤 소개할 수 있어요." : "앨범 내용을 이해하고 대화하는 오프라인 AI는 아직 연결되지 않았어요. 현재는 소개할 글을 확인할 수 있어요."}</p>
      <button type="button" ref={closeRef} className="albumIntroClose" onClick={onClose}>닫기</button>
    </section>
  </div>;
}
