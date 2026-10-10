import { loadOfflineOnnx, rgbChw, type ort } from '../../ai/onnxRuntime';
import { decodePetHeatmaps, petHeadDirection, PET_POSE_MODEL, type PetPose } from './poseGeometry';

export class PetPoseModel {
  private session: Promise<ort.InferenceSession> | undefined;
  async analyze(canvas: OffscreenCanvas, box: [number, number, number, number], base: string): Promise<PetPose> {
    this.session ??= loadOfflineOnnx(new URL('../', base).href, 'pet-pose/quadpose.onnx').catch(error => { this.session = undefined; throw error; });
    const model = await this.session;
    const [x, y, w, h] = box, side = Math.max(w, h) * 1.25, cx = x + w / 2, cy = y + h / 2;
    const crop = new OffscreenCanvas(256, 256), context = crop.getContext('2d')!;
    // Square, 1.25 padding and black outside image, matching the trained crop.
    context.setTransform(256 / side, 0, 0, 256 / side, -(cx - side / 2) * 256 / side, -(cy - side / 2) * 256 / side);
    context.drawImage(canvas, 0, 0);
    // The graph embeds normalization: raw RGB [0,255], CHW input.
    const input = rgbChw(context.getImageData(0, 0, 256, 256).data, 256);
    let outputs: Record<string, ort.Tensor> = {};
    try {
      outputs = await model.run({ [model.inputNames[0]]: input });
      const output = outputs[model.outputNames[0]], points = decodePetHeatmaps(output.data as Float32Array, output.dims);
      const view = petHeadDirection(points);
      const keypoints = points.map(p => ({ ...p, x: (cx + (p.x - .5) * side) / canvas.width, y: (cy + (p.y - .5) * side) / canvas.height }));
      return { modelVersion: PET_POSE_MODEL, view, keypoints };
    } finally { input.dispose(); Object.values(outputs).forEach(output => output.dispose()); }
  }
}
