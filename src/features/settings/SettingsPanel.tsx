import { LoaderCircle, Trash2 } from "lucide-react";

export function SettingsPanel({ itemCount, clearing, onClear }: { itemCount: number; clearing: boolean; onClear: () => void }) {
  return (
    <div className="settingsPanel">
      <label>
        <span>사진을 불러올 기본 위치</span>
        <input readOnly value="D:/Pictures" />
      </label>
      <label>
        <span>미리보기 저장 위치</span>
        <input readOnly value="D:/오래담은/미리보기" />
      </label>
      <label>
        <span>앱 시작 화면</span>
        <input readOnly value="사진보기" />
      </label>
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

