import { useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { MediaItem } from '../../types/media';
import { normalizeLocalFilePath } from '../media/mediaSource';
import { measurePersonRuntime } from './engine/deviceBenchmark';
import { measureRecognitionRepetition } from './engine/repetitionBenchmark';

type Environment = { os: string; architecture: string; version: string };
type Mode = 'speed' | 'people' | 'alternating';
type SpeedReport = Awaited<ReturnType<typeof measurePersonRuntime>> & { environment: Environment };
type RepetitionReport = Awaited<ReturnType<typeof measureRecognitionRepetition>> & { environment: Environment };

export function PersonDeviceBenchmarkPanel({ photos, disabled, onBusy }: { photos: MediaItem[]; disabled: boolean; onBusy: (value: boolean) => void }) {
  const [media, setMedia] = useState(photos[0]?.id ?? ''), [petMedia, setPetMedia] = useState(photos[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('speed'), [cycles, setCycles] = useState(20);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(0), [message, setMessage] = useState('');
  const [report, setReport] = useState<SpeedReport | null>(null), [repetition, setRepetition] = useState<RepetitionReport | null>(null);
  const active = useRef<AbortController | null>(null), alive = useRef(true);
  const total = mode === 'speed' ? 8 : cycles * (mode === 'alternating' ? 2 : 1);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);

  async function measure() {
    if (disabled || active.current || !media || (mode === 'alternating' && !petMedia)) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); onBusy(true); setDone(0); setReport(null); setRepetition(null); setMessage('');
    try {
      const photo = photos.find(p => p.id === media), petPhoto = mode === 'alternating' ? photos.find(p => p.id === petMedia) : undefined;
      if (!photo || (mode === 'alternating' && !petPhoto)) throw new Error('측정 사진을 선택해 주세요.');
      const selected = [...new Map([photo, ...(petPhoto ? [petPhoto] : [])].map(p => [p.id, p])).values()];
      const sources = new Map<string, string>();
      for (const item of selected) {
        controller.signal.throwIfAborted();
        const source = await invoke<{ source_key: string }>('get_person_scan_source', { mediaId: Number(item.id) });
        sources.set(item.id, source.source_key);
      }
      const environment = await invoke<Environment>('person_runtime_environment');
      controller.signal.throwIfAborted();
      const url = (p: MediaItem) => convertFileSrc(normalizeLocalFilePath(p.filePath));
      const progress = (n: number) => { if (alive.current) setDone(n); };
      const result = mode === 'speed'
        ? { speed: await measurePersonRuntime(url(photo), controller.signal, progress) }
        : { repetition: await measureRecognitionRepetition(url(photo), petPhoto ? url(petPhoto) : undefined, cycles, controller.signal, progress) };
      for (const item of selected) {
        controller.signal.throwIfAborted();
        const after = await invoke<{ source_key: string }>('get_person_scan_source', { mediaId: Number(item.id) });
        if (after.source_key !== sources.get(item.id)) throw new Error('측정 중 사진이 변경됐습니다. 결과를 표시하지 않았습니다.');
      }
      controller.signal.throwIfAborted();
      if (alive.current) {
        if (result.speed) setReport({ ...result.speed, environment });
        if (result.repetition) setRepetition({ ...result.repetition, environment });
      }
    } catch (e) {
      if (alive.current) setMessage(controller.signal.aborted ? '인물 측정을 중단했습니다.' : e instanceof Error ? e.message : String(e));
    } finally {
      active.current = null; if (alive.current) setBusy(false); onBusy(false);
    }
  }

  return <section className="personValidationPanel" aria-label="이 기기 인물 처리 속도">
    <h3>이 기기 인물 처리 속도</h3>
    <label>측정 방식<select aria-label="인물 기기 측정 방식" value={mode} disabled={busy || disabled} onChange={e => { setMode(e.target.value as Mode); setReport(null); setRepetition(null); setMessage(''); }}>
      <option value="speed">CPU·WASM 속도 비교</option><option value="people">인물 반복 분석</option><option value="alternating">인물·반려동물 번갈아 분석</option>
    </select></label>
    <p>{mode === 'speed' ? '선택 사진을 CPU와 WASM으로 각각 4번 분석합니다. 첫 실행과 이후 3회의 중앙값을 분리하며 사진·인물 연결을 저장하지 않습니다.' : mode === 'people' ? '같은 인물 사진을 반복 분석해 시간과 모델 텐서 변화를 확인합니다. 사진·인물 연결을 저장하지 않습니다.' : '인물 사진과 반려동물 사진을 번갈아 분석합니다. 엔진 전환 시 모델을 다시 불러오는 시간을 포함하며 사진·인물·반려동물 연결을 저장하지 않습니다.'}</p>
    <label>인물 속도 측정 사진<select aria-label="인물 속도 측정 사진" value={media} disabled={busy || disabled} onChange={e => { setMedia(e.target.value); setReport(null); setRepetition(null); }}>{photos.map(p => <option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>
    {mode === 'alternating' && <label>반려동물 측정 사진<select aria-label="반려동물 전환 측정 사진" value={petMedia} disabled={busy || disabled} onChange={e => { setPetMedia(e.target.value); setRepetition(null); }}>{photos.map(p => <option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>}
    {mode !== 'speed' && <><label>반복 횟수<select aria-label="인물 반복 측정 횟수" value={cycles} disabled={busy || disabled} onChange={e => { setCycles(Number(e.target.value)); setRepetition(null); }}>{[20, 50, 100].map(n => <option key={n} value={n}>{n}회{mode === 'alternating' ? ` · 총 ${n * 2}장 분석` : ''}</option>)}</select></label><p>최대 10분 동안 측정하며 제한 시간이나 오류에 도달하면 결과를 완료 처리하지 않습니다. 화면을 열어 둔 채 실행해 주세요.</p></>}
    <div className="peopleActions"><button disabled={busy || disabled || !media || (mode === 'alternating' && !petMedia)} onClick={() => void measure()}>이 기기 인물 속도 측정</button>{busy && <button onClick={() => active.current?.abort()}>인물 측정 중단</button>}</div>
    <p role="status">{busy ? `인물 처리 속도 측정 ${done}/${total}` : message}</p>
    {report && <div role="status"><p>{report.environment.os} · {report.environment.architecture} · 앱 {report.environment.version}</p><p>CPU 추론 중앙값 {(report.cpu.medianInferenceMs / 1000).toFixed(2)}초 · WASM {(report.wasm.medianInferenceMs / 1000).toFixed(2)}초{report.wasm.simd ? ' / SIMD' : ''}</p><p>사진 읽기·대기 포함 CPU {(report.cpu.medianPhotoMs / 1000).toFixed(2)}초 · WASM {(report.wasm.medianPhotoMs / 1000).toFixed(2)}초</p><p>첫 실행 CPU {(report.cpu.firstMs / 1000).toFixed(2)}초 · WASM {(report.wasm.firstMs / 1000).toFixed(2)}초</p><p>CPU/WASM 특징 거리 {report.maxBackendDistance === null ? '비교 불가' : report.maxBackendDistance.toExponential(2)} · 모델 텐서 최대 {(Math.max(...report.cpu.tensorBytes, ...report.wasm.tensorBytes) / 1e6).toFixed(1)} MB</p></div>}
    {repetition && <div role="status"><p>{repetition.environment.os} · {repetition.environment.architecture} · 앱 {repetition.environment.version}</p><p>반복 측정 완료 · {repetition.samples.length}장 분석 · 인물·반려동물 전환 {repetition.domainSwitches}회 · {(repetition.elapsedMs / 1000).toFixed(1)}초</p>
      {([['인물', repetition.people], ['반려동물', repetition.pets]] as const).map(([label, value]) => value && <div key={label}><h4>{label} {value.runs}회 · {value.backends.join(', ')}</h4><p>첫 분석 {(value.firstPhotoMs / 1000).toFixed(2)}초 · 이후 사진 읽기·대기 포함 중앙값 {(value.laterMedianPhotoMs / 1000).toFixed(2)}초 · Worker 중앙값 {(value.laterMedianWorkerMs / 1000).toFixed(2)}초</p><p>탐지 수 {value.minDetections}~{value.maxDetections} · 텐서 수 {value.minTensors}~{value.maxTensors} · 텐서 메모리 처음 {(value.firstTensorBytes / 1e6).toFixed(1)} / 마지막 {(value.lastTensorBytes / 1e6).toFixed(1)} / 최대 {(value.maxTensorBytes / 1e6).toFixed(1)} MB</p></div>)}
      {repetition.people.maxDetections === 0 && <p>인물 사진에서 얼굴을 찾지 못했습니다. 얼굴이 보이는 사진으로 다시 측정해 주세요.</p>}
      {repetition.pets?.maxDetections === 0 && <p>반려동물 사진에서 동물을 찾지 못했습니다. 강아지·고양이가 보이는 사진으로 다시 측정해 주세요.</p>}
    </div>}
    {(report || repetition) && <small>선택한 사진과 현재 환경에 한정됩니다. 텐서 수치는 전체 앱 메모리가 아니며 발열·배터리·장시간 대량 등록·식별 정확도를 증명하지 않습니다. 첫 실행에 모델이 메모리에 남아 있을 수 있습니다.{repetition?.mode === 'alternating' ? ' 전환 측정에서는 매번 모델을 다시 불러오므로 이후 값도 모델 로딩 시간을 포함합니다.' : ''}{report ? ' WASM 미지원 시 속도 비교를 실패로 표시합니다.' : ' 반복 측정은 가능한 백엔드로 실행하며 실제 사용된 백엔드를 표시합니다.'}</small>}
  </section>;
}
