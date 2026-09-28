import { LoaderCircle, Trash2 } from "lucide-react";

export function SettingsPanel({ itemCount, clearing, onClear }: { itemCount: number; clearing: boolean; onClear: () => void }) {
  return (
    <div className="settingsPanel">
      <section className="settingsSummary" aria-label="앱 시작 화면">
        <h2>앱 시작 화면</h2>
        <p>그루터기를 열면 사진 기록이 먼저 표시됩니다.</p>
      </section>
      <section className="dangerPanel" aria-label="등록 목록 관리">
        <div>
          <h2>등록 목록 비우기</h2>
          <p>앱에 등록된 {itemCount}개의 항목만 지웁니다. 원본 파일은 그대로 남습니다.</p>
        </div>
        <button className="dangerButton" onClick={onClear} disabled={clearing || itemCount === 0}>
          {clearing ? <LoaderCircle className="spinIcon" size={17} /> : <Trash2 size={17} />}
          {clearing ? "비우는 중" : "모두 비우기"}
        </button>
      </section>
    </div>
  );
}

