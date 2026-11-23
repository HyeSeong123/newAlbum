import { useRef } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useModalBehavior } from "../../hooks/useModalBehavior";

export function AlbumIntroductionDialog({ albumTitle, characterName, content, onClose }: {
  albumTitle: string;
  characterName: string | null;
  content: { sections: string[]; hasStory: boolean };
  onClose: () => void;
}) {
  useModalBehavior(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  const onKeyDown = useDialogFocus(dialogRef, true, ".albumIntroClose");
  return <div className="albumIntroBackdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} onKeyDown={onKeyDown} className="albumIntroDialog" role="dialog" aria-modal="true" aria-labelledby="albumIntroTitle" aria-describedby="albumIntroDescription">
      <header className="albumIntroHeader">
        <h2 id="albumIntroTitle">{characterName ? `${characterName}에게 앨범 소개하기` : "앨범 소개 준비"}</h2>
        <button type="button" className="albumIntroClose" onClick={onClose}>닫기</button>
      </header>
      <p id="albumIntroDescription">‘{albumTitle}’에서 소개할 글의 미리보기예요. 캐릭터와 대화하는 기능은 준비 중이에요.</p>
      <div className="albumIntroPreview" role="region" aria-label="소개할 앨범 내용" tabIndex={0}>
        {content.sections.map((section, index) => <p key={index}>{section}</p>)}
        {!content.hasStory && <p>사진 설명이나 챕터, 편지를 작성하면 여기에 추가돼요.</p>}
      </div>
      {!characterName && <p>대표 친구를 선택한 뒤 소개할 수 있어요.</p>}
    </section>
  </div>;
}
