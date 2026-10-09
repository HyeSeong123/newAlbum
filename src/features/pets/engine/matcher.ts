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
  if (rear) return { score: 0.75 * color + 0.25 * shape, basis };
  const appearance = Math.max(cosine(a.appearance, b.appearance), cosine(a.appearance, b.mirroredAppearance), cosine(a.mirroredAppearance, b.appearance));
  if (!appearance) return { score: 0, basis };
  return { score: 0.8 * appearance + 0.15 * color + 0.05 * shape, basis };
}
export function rankPets(query: PetFeatures, references: PetReference[], limit = 3): PetCandidate[] {
  const best = new Map<number, PetCandidate>();
  for (const reference of references) {
    const comparison = comparePets(query, reference.features);
    if (comparison.score <= 0 || comparison.score <= (best.get(reference.petId)?.score ?? 0)) continue;
    best.set(reference.petId, { petId: reference.petId, ...comparison });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.petId - b.petId).slice(0, limit);
}
// Candidate retrieval cutoff only: 0.60 is NOT a claimed 60% accuracy.
// No automatic identity linking until independently measured false-link rates
// and model/view-specific calibration are available. Rear/unknown always abstain.
export function recognizePet(query: PetFeatures, references: PetReference[]): RecognitionResult {
  const candidates = rankPets(query, references).filter(candidate => candidate.score >= 0.60);
  return { state: query.view === 'rear' ? 'rear-review' : candidates.length ? 'needs-review' : 'unregistered', candidates, autoPetId: null };
}
export function withView(features: PetFeatures, view: PetFeatures['view']): PetFeatures {
  return { ...features, view, viewSource: view === 'unknown' ? 'unknown' : 'user',
    appearance: view === 'rear' ? [] : features.appearance,
    mirroredAppearance: view === 'rear' ? [] : features.mirroredAppearance };
}
