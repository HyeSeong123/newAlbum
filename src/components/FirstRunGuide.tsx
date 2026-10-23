import { useEffect, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useModalBehavior } from "../hooks/useModalBehavior";
import "./first-run-guide.css";
import { CharacterSpeech, useHelpCharacter } from "../features/characters/CharacterHelp";
import { resolveHelpDialogue } from "../features/help/helpDialogue";

export const FIRST_RUN_KEY = "geuruteogi.first-run-completed-v1";

export function FirstRunGuide({ onImport, onLater, onGuide }: { onImport: () => void; onLater: () => void; onGuide: () => void }) {
  const character = useHelpCharacter();
  const dialogue = resolveHelpDialogue(character.definition, character.affection, "사진과 영상을 가져오면 날짜별로 둘러보고, 앨범과 추억으로 다시 볼 수 있어요.");
  const firstButton = useRef<HTMLButtonElement>(null);
  const laterButton = useRef<HTMLButtonElement>(null);
  useModalBehavior(onLater);
  useEffect(() => { firstButton.current?.focus(); }, []);

  return <div className="modalBackdrop firstRunBackdrop">
    <section className="firstRunGuide" role="dialog" aria-modal="true" aria-labelledby="firstRunTitle" aria-describedby="firstRunDescription"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && document.activeElement === firstButton.current) { event.preventDefault(); laterButton.current?.focus(); }
        else if (!event.shiftKey && document.activeElement === laterButton.current) { event.preventDefault(); firstButton.current?.focus(); }
      }}>
      <h2 id="firstRunTitle">감자싹에 사진을 담아보세요</h2>
      <div id="firstRunDescription">
        <CharacterSpeech>
          <p>{dialogue.line} {dialogue.instruction}</p>
          <p>원본 사진과 영상 파일은 그대로 두고 함께 추억을 정리해 봐요.</p>
        </CharacterSpeech>
      </div>
      <button ref={firstButton} className="primary firstRunImport" onClick={onImport}><ImagePlus size={20} />사진 가져오기</button>
      <button type="button" onClick={onGuide}>{character.name}와 사용 방법 살펴보기</button>
      <button ref={laterButton} className="firstRunLater" onClick={onLater}>나중에 하기</button>
    </section>
  </div>;
}
