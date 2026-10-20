import { useState, lazy, Suspense } from 'react';
import type { MediaItem } from '../../types/media';
// Evaluation exports and benchmarks belong to developer builds, not photo management.
const RecognitionEvaluation=import.meta.env.DEV ? lazy(()=>import('./RecognitionEvaluation').then(m=>({default:m.RecognitionEvaluation}))) : null;
import { LoaderCircle, Trash2 } from "lucide-react";

export function SettingsPanel({ itemCount, clearing, onClear, photos=[] }: { photos?:MediaItem[]; itemCount: number; clearing: boolean; onClear: () => void }) {
  const [evaluation,setEvaluation]=useState(false);
  return (
    <div className="settingsPanel">
      <section className="settingsSummary" aria-label="앱 시작 화면">
        <h2>앱 시작 화면</h2>
        <p>감자싹을 열면 홈이 먼저 표시됩니다. 로고를 누르면 언제든 홈으로 돌아갈 수 있습니다.</p>
      </section>
      {RecognitionEvaluation && <section className="settingsSummary"><h2>개발용 인식 검증</h2><p>별도 평가 자료로 성능을 확인합니다.</p><button aria-expanded={evaluation} onClick={()=>setEvaluation(!evaluation)}>{evaluation?'인식 검증 닫기':'인식 검증 열기 · 고급'}</button>{evaluation&&<Suspense fallback={<p>불러오는 중</p>}><RecognitionEvaluation photos={photos}/></Suspense>}</section>}
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
