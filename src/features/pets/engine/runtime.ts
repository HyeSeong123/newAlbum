import * as tf from '@tensorflow/tfjs';
import { setThreadsCount, setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

export type PetBackendPreference = 'auto' | 'cpu';
let configured = false;
let wasmFailed = false;

// All binaries ship with the app. A single thread also works in WebViews
// without cross-origin isolation or SharedArrayBuffer.
export async function selectPetBackend(base: string, preference: PetBackendPreference = 'auto') {
  if (!configured) {
    setWasmPaths(`${base}runtime/`);
    setThreadsCount(1);
    tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    configured = true;
  }
  if (preference === 'auto' && !wasmFailed) {
    try {
      if (await tf.setBackend('wasm')) { await tf.ready(); return 'wasm' as const; }
    } catch { /* Keep the offline CPU path on unsupported WebViews. */ }
    wasmFailed = true;
  }
  if (!await tf.setBackend('cpu')) throw new Error('반려동물 분석을 시작하지 못했습니다.');
  await tf.ready();
  return 'cpu' as const;
}

export function disablePetWasm() { wasmFailed = true; }
export function petRuntimeInfo() {
  const memory = tf.memory();
  return {
    backend: tf.getBackend(), wasmFallback: wasmFailed,
    simd: tf.getBackend() === 'wasm' && tf.env().getBool('WASM_HAS_SIMD_SUPPORT'),
    threads: 1, tensors: memory.numTensors, tensorBytes: memory.numBytes,
    // Tensor accounting excludes the JS heap, decoder, and WASM heap capacity.
    tensorMemoryUnreliable: memory.unreliable,
  };
}
