import { loadOfflineOnnx, rgbChw, type ort } from '../../ai/onnxRuntime';
import type { Point } from './pose';
import { alignmentTransform, validEmbedding } from './faceAlignment';

export const PERSON_512_MODEL = 'facex-tiny-512-af7ca993-v1';
// The author explicitly licenses the self-trained weights as Apache-2.0.
// Training-image commercial clearance and independent identity accuracy remain
// unverified: this registry admits the requested development APK only.
export const APPROVED_512_MODELS = [{ version: PERSON_512_MODEL, dimensions: 512, inputSize: 112, assetDirectory: '../people512/' }] as const;
export class OnnxFace512Adapter {
  private model: ort.InferenceSession | null = null;
  async load(version: string, base: string) {
    if (version !== PERSON_512_MODEL) throw new Error('알 수 없는 512차원 모델입니다.');
    this.dispose();
    this.model = await loadOfflineOnnx(new URL('../', base).href, 'people512/facex-tiny.onnx');
    if (this.model.inputNames.length !== 1 || this.model.outputNames.length !== 1) { this.dispose(); throw new Error('Invalid face model interface'); }
  }
  async extract(image: OffscreenCanvas, landmarks: Point[]): Promise<number[]> {
    if (!this.model) throw new Error('512차원 모델을 불러오지 못했습니다.');
    const aligned = new OffscreenCanvas(112, 112), context = aligned.getContext('2d')!;
    context.setTransform(...alignmentTransform(landmarks) as [number, number, number, number, number, number]);
    context.drawImage(image, 0, 0);
    const input = rgbChw(context.getImageData(0, 0, 112, 112).data, 112, 127.5, 1 / 128);
    let outputs: Record<string, ort.Tensor> = {};
    try {
      outputs = await this.model.run({ [this.model.inputNames[0]]: input });
      const output = outputs[this.model.outputNames[0]];
      if (output.dims.length !== 2 || output.dims[0] !== 1 || output.dims[1] !== 512) throw new Error('Model must output a learned 512-D embedding');
      const vector = Array.from(output.data as Float32Array);
      if (!validEmbedding(vector, 512)) throw new Error('Invalid learned face embedding');
      const norm = Math.hypot(...vector);
      return vector.map(v => v / norm);
    } finally { input.dispose(); Object.values(outputs).forEach(output => output.dispose()); }
  }
  dispose() { const previous = this.model; this.model = null; if (previous) void previous.release().catch(() => undefined); }
}
