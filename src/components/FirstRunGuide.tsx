import { useEffect, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useModalBehavior } from "../hooks/useModalBehavior";
import "./first-run-guide.css";
import { CameraLocationNotice } from "./CameraLocationNotice";
import { CharacterVisual } from "../features/characters/CharacterVisual";
import { characterDefinitions } from "../features/characters/models";

export const FIRST_RUN_KEY = "geuruteogi.first-run-completed-v1";

export function FirstRunGuide({ onImport, onLater, onGuide }: { onImport: () => void; onLater: () => void; onGuide: () => void }) {
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
      <div className="firstRunMascot" aria-hidden="true"><CharacterVisual definition={characterDefinitions.find(def => def.id === "gomi")!} stage={6} /></div>
      <h2 id="firstRunTitle">감자싹에 사진을 담아보세요</h2>
      <div id="firstRunDescription">
        <p>난 고미야. 사진 등록부터 앨범까지, 중요한 것만 알려줄게.</p>
        <p>사진과 영상을 가져오면 날짜별로 둘러보고, 앨범과 추억으로 다시 볼 수 있습니다.</p>
        <p>감자싹은 원본 사진과 영상 파일을 삭제하거나 수정하지 않습니다.</p>
      </div>
      <CameraLocationNotice />
      <button ref={firstButton} className="primary firstRunImport" onClick={onImport}><ImagePlus size={20} />사진 가져오기</button>
      <button type="button" onClick={onGuide}>고미와 사용 방법 살펴보기</button>
      <button ref={laterButton} className="firstRunLater" onClick={onLater}>나중에 하기</button>
    </section>
  </div>;
}
