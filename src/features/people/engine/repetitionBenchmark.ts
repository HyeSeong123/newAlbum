import { analyzePersonImage } from './client';
import { analyzePetImage } from '../../pets/engine/client';

type Domain = 'people' | 'pets';
type Diagnostics = { backend: string; elapsedMs: number; tensors: number; tensorBytes: number };
export type RepetitionSample = {
  domain: Domain; wallMs: number; diagnostics: Diagnostics; detections: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Retain only scalar diagnostics. Face/pet vectors and thumbnails never enter
// the report or accumulate across repetitions; normal clients own disposal.
export async function measureRecognitionRepetition(
  personUrl: string, petUrl: string | undefined, cycles: number,
  outerSignal: AbortSignal, onProgress: (done: number) => void,
) {
  outerSignal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(outerSignal.reason);
  outerSignal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('10분 측정 제한에 도달했습니다. 반복 횟수를 줄여 다시 측정해 주세요.')), 10 * 60_000);
  try { return await repeat(personUrl, petUrl, cycles, controller.signal, onProgress); }
  finally { clearTimeout(timer); outerSignal.removeEventListener('abort', abort); }
}

async function repeat(
  personUrl: string, petUrl: string | undefined, cycles: number,
  signal: AbortSignal, onProgress: (done: number) => void,
) {
  if (!Number.isInteger(cycles) || cycles < 2 || cycles > 100) throw new Error('반복 횟수는 2~100회여야 합니다.');
  const samples: RepetitionSample[] = [], started = performance.now();
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const domain of petUrl ? ['people', 'pets'] as const : ['people'] as const) {
      signal.throwIfAborted();
      if (performance.now() - started > 10 * 60_000) throw new Error('10분 측정 제한에 도달했습니다. 반복 횟수를 줄여 다시 측정해 주세요.');
      let diagnostics: Diagnostics | undefined;
      const at = performance.now();
      const features = domain === 'people'
        ? await analyzePersonImage(personUrl, signal, 'auto', value => { diagnostics = value; })
        : await analyzePetImage(petUrl!, signal, 'unknown', undefined, 'auto', value => { diagnostics = value; });
      signal.throwIfAborted();
      if (performance.now() - started > 10 * 60_000) throw new Error('10분 측정 제한에 도달했습니다. 반복 횟수를 줄여 다시 측정해 주세요.');
      if (!diagnostics || ![diagnostics.elapsedMs, diagnostics.tensors, diagnostics.tensorBytes].every(value => Number.isFinite(value) && value >= 0)) {
        throw new Error('반복 분석 측정값을 받지 못했습니다.');
      }
      const { backend, elapsedMs, tensors, tensorBytes } = diagnostics;
      samples.push({ domain, wallMs: performance.now() - at, diagnostics: { backend, elapsedMs, tensors, tensorBytes }, detections: features.length });
      onProgress(samples.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  signal.throwIfAborted();
  const summarize = (domain: Domain) => {
    const rows = samples.filter(sample => sample.domain === domain);
    if (!rows.length) return null;
    const warm = rows.slice(1);
    return {
      runs: rows.length, firstPhotoMs: rows[0].wallMs,
      laterMedianPhotoMs: median(warm.map(row => row.wallMs)),
      laterMedianWorkerMs: median(warm.map(row => row.diagnostics.elapsedMs)),
      backends: [...new Set(rows.map(row => row.diagnostics.backend))],
      minDetections: Math.min(...rows.map(row => row.detections)), maxDetections: Math.max(...rows.map(row => row.detections)),
      minTensors: Math.min(...rows.map(row => row.diagnostics.tensors)), maxTensors: Math.max(...rows.map(row => row.diagnostics.tensors)),
      firstTensorBytes: rows[0].diagnostics.tensorBytes, lastTensorBytes: rows.at(-1)!.diagnostics.tensorBytes,
      maxTensorBytes: Math.max(...rows.map(row => row.diagnostics.tensorBytes)),
    };
  };
  return {
    mode: petUrl ? 'alternating' as const : 'people' as const, cycles,
    domainSwitches: petUrl ? samples.length - 1 : 0, elapsedMs: performance.now() - started,
    people: summarize('people')!, pets: summarize('pets'), samples,
    identityAccuracyMeasured: false, wholeAppPeakMemoryMeasured: false, heatOrBatteryMeasured: false,
  };
}
