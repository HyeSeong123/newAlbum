import { Pause, Play, ScanSearch, X } from 'lucide-react';
import type { PetAnalysis } from './usePetAnalysis';

/** A single status surface per view; reviewing opens the actual result picker. */
export function PetAnalysisStatus({ analysis, onReview }: { analysis: PetAnalysis; onReview: () => void }) {
  const progress = analysis.progress;
  if (!progress) return null;
  return <div className="petAnalysisNotice">
    <span role="status">{progress.message}</span>
    {progress.running && <progress aria-label="반려동물 분석 진행" value={progress.done} max={progress.total || 1} />}
    <div className="petStatusActions">
      {progress.running ? <button onClick={analysis.cancel}><Pause size={16} />분석 중단</button> : <>
        <button onClick={onReview}><ScanSearch size={16} />찾은 사진 연결</button>
        {analysis.waiting > 0 && <button onClick={analysis.resume}><Play size={16} />이어서 분석</button>}
        <button onClick={analysis.dismiss} aria-label="분석 알림 닫기"><X size={16} />닫기</button>
      </>}
    </div>
  </div>;
}
