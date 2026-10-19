import { infer, validateModel, type Model } from './network';
import type { RGBImage } from './core';
/** A Worker owns exactly one model. Replacing/disposal clears old weights. */
export class SyntheticSession {
  private model?: Model;
  private digest?: string;
  async load(text: string, sha256: string) {
    try {
    if (!/^[a-f0-9]{64}$/.test(sha256) || text.length > 2_000_000) throw new Error('INVALID_MODEL_ASSET');
    const bytes = new TextEncoder().encode(text);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== sha256) throw new Error('MODEL_HASH_MISMATCH');
    if (this.digest === hash) return;
    this.dispose();
    const model = JSON.parse(text) as Model; validateModel(model);
    if (model.status !== 'synthetic-trained') throw new Error('MODEL_UNTRAINED');
    this.model = model; this.digest = hash;
    } catch (error) { this.dispose(); throw error; }
  }
  run(image: RGBImage) { if (!this.model) throw new Error('MODEL_NOT_LOADED'); return infer(this.model, image); }
  dispose() { this.model?.layers.forEach(l => { l.weights.fill(0); l.bias.fill(0); }); this.model = undefined; this.digest = undefined; }
}
