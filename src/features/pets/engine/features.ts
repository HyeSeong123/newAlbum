export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm && vector.every(Number.isFinite) ? vector.map(value => value / norm) : [];
}
// Cheap, reproducible descriptors. Border-based foreground is only a proxy;
// patterned backgrounds and occlusion require a future segmentation model.
export function cropDescriptors(rgba: Uint8ClampedArray, width: number, height: number, aspect: number) {
  const color = Array<number>(5 * 24).fill(0), shape = Array<number>(10).fill(0);
  const border: number[][] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
    const i = (y * width + x) * 4; border.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  const background = [0, 1, 2].map(channel => border.map(pixel => pixel[channel]).sort((a,b) => a-b)[Math.floor(border.length / 2)] ?? 0);
  let foreground = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const cell = 1 + Number(x >= width / 2) + 2 * Number(y >= height / 2);
    for (let c = 0; c < 3; c++) { const bin = c * 8 + Math.min(7, Math.floor(rgba[i+c] / 32)); color[bin]++; color[cell * 24 + bin]++; }
    const distance = Math.sqrt(background.reduce((sum, value, c) => sum + (rgba[i+c] - value) ** 2, 0));
    if (distance > 60) { foreground++; shape[2 + Math.min(7, Math.floor(y / height * 8))]++; }
  }
  shape[0] = Math.min(4, aspect) / 4;
  shape[1] = foreground / (width * height);
  for (let i = 2; i < 10; i++) shape[i] /= width * height / 8;
  return { color: normalize(color), shape: normalize(shape) };
}
