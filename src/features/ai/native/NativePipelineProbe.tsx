import { useEffect, useRef, useState } from 'react';
import { runSyntheticProbe, disposeNativeAI } from './client';
/** Development-only diagnostics, reached solely by an explicit settings action. */
export function NativePipelineProbe() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('합성 색상 분류 모델로 실행 경로만 점검합니다. 사람·반려동물 인식 결과가 아닙니다.');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); disposeNativeAI(); }, []);
  async function run() {
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}models/native-dev/provenance.json`, { signal: abort.signal });
      if (!response.ok) throw new Error('합성 모델을 먼저 준비해 주세요: npm run ai:train:synthetic -- --install-probe');
      const provenance = await response.json();
      const data = new Uint8Array(8 * 8 * 3); for (let i = 0; i < data.length; i++) data[i] = i % 3 === 0 ? 210 : 35;
      const result = await runSyntheticProbe({ intent: 'user-request', image: { width: 8, height: 8, channels: 3, data }, modelUrl: `${import.meta.env.BASE_URL}models/native-dev/model.json`, sha256: provenance.weightsSha256 }, abort.signal);
      setMessage(`합성 모델 Worker 실행 확인 · ${result.probabilities.length}개 색상 분류 출력 · 실제 개체 식별 미지원`);
    } catch (error) { setMessage(abort.signal.aborted ? '점검을 중단했습니다.' : error instanceof Error ? error.message : '실행 실패'); }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
  }
  return <section><h4>개발용 실행 점검</h4><p role="status">{message}</p><button disabled={busy} onClick={() => { void run(); }}>합성 모델 실행 점검</button>{busy && <button onClick={() => controller.current?.abort()}>중단</button>}</section>;
}
