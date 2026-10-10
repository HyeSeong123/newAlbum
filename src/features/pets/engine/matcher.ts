import type { PetCandidate, PetFeatures, PetReference, RecognitionResult } from './types';
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? Math.max(0, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}
export function comparePets(a: PetFeatures, b: PetFeatures): { score: number; basis: PetCandidate['basis'] } {
  const rear = a.view === 'rear' || b.view === 'rear';
  const basis = rear ? 'shape-color' : 'appearance';
  if (a.kind !== b.kind) return { score: 0, basis };
  const color = cosine(a.color, b.color), shape = cosine(a.shape, b.shape);
  if (rear) {
    const af=a.foreground,bf=b.foreground;
    if(af?.version==='border-connected-v1' && bf?.version===af.version && af.color.length===120 && bf.color.length===120 && af.shape.length===10 && bf.shape.length===10)
      return {score:.75*cosine(af.color,bf.color)+.25*cosine(af.shape,bf.shape),basis};
    return { score: 0.75 * color + 0.25 * shape, basis };
  }
  const appearance = Math.max(cosine(a.appearance, b.appearance), cosine(a.appearance, b.mirroredAppearance), cosine(a.mirroredAppearance, b.appearance));
  if (!appearance) return { score: 0, basis };
  const face = Math.max(cosine(a.faceAppearance ?? [], b.faceAppearance ?? []), cosine(a.faceAppearance ?? [], b.mirroredFaceAppearance ?? []), cosine(a.mirroredFaceAppearance ?? [], b.faceAppearance ?? []));
  if (a.faceAppearance?.length && b.faceAppearance?.length && a.faceAppearance.length === b.faceAppearance.length && a.faceAppearance.every(Number.isFinite) && b.faceAppearance.every(Number.isFinite) && a.view !== 'unknown' && b.view !== 'unknown') {
    const weight = a.view === 'front' && b.view === 'front' ? 0.65 : 0.45;
    return { score: weight * face + (0.85-weight) * appearance + 0.10 * color + 0.05 * shape, basis: 'face-appearance' };
  }
  return { score: 0.8 * appearance + 0.15 * color + 0.05 * shape, basis };
}
export function rankPets(query: PetFeatures, references: PetReference[], limit = 3): PetCandidate[] {
  const best = new Map<number, PetCandidate>();
  const priority=(candidate:{basis:PetCandidate['basis']})=>query.view==='rear'?0:candidate.basis==='face-appearance'?0:candidate.basis==='appearance'?1:2;
  // Prefer the available face references for this query; a high generic body
  // similarity must not outrank a face comparison on the same pet.
  const facePets = new Set(query.view !== 'rear' && query.view !== 'unknown' && query.faceAppearance?.length ? references.filter(r => r.features.kind === query.kind && r.features.view !== 'rear' && r.features.view !== 'unknown' && r.features.faceAppearance?.length).map(r => r.petId) : []);
  for (const reference of references) {
    const comparison = comparePets(query, reference.features);
    if (facePets.has(reference.petId) && comparison.basis !== 'face-appearance') continue;
    const existing=best.get(reference.petId);
    if (comparison.score<=0 || existing && (priority(existing)<priority(comparison) || priority(existing)===priority(comparison) && existing.score>=comparison.score)) continue;
    best.set(reference.petId, { petId: reference.petId, ...comparison });
  }
  return [...best.values()].sort((a, b) => priority(a)-priority(b) || b.score - a.score || a.petId - b.petId).slice(0, limit);
}
// Candidate retrieval cutoff only: 0.60 is NOT a claimed 60% accuracy.
// No automatic identity linking until independently measured false-link rates
// and model/view-specific calibration are available. Rear/unknown always abstain.
export function recognizePet(query: PetFeatures, references: PetReference[]): RecognitionResult {
  const candidates = rankPets(query, references,Infinity).filter(candidate => candidate.score >= 0.60).slice(0,3);
  return { state: query.view === 'rear' ? 'rear-review' : candidates.length ? 'needs-review' : 'unregistered', candidates, autoPetId: null };
}
export function withView(features: PetFeatures, view: PetFeatures['view']): PetFeatures {
  return { ...features, view, viewSource: view === 'unknown' ? 'unknown' : 'user',
    appearance: view === 'rear' ? [] : features.appearance,
    mirroredAppearance: view === 'rear' ? [] : features.mirroredAppearance,
    faceBox: view === 'rear' || view === 'unknown' ? undefined : features.faceBox,
    faceAppearance: view === 'rear' || view === 'unknown' ? [] : features.faceAppearance,
    mirroredFaceAppearance: view === 'rear' || view === 'unknown' ? [] : features.mirroredFaceAppearance };
}
