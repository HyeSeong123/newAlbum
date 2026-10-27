import type { PetCandidate, PetFeatures, PetReference, RecognitionResult } from './types';
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))return 0; dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
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
  // Invalid or zero-valued face vectors must not outrank intact body evidence.
  // Genuine but dissimilar face vectors (cosine 0) still remain face evidence.
  const usableFaces = !!a.faceAppearance?.length && !!b.faceAppearance?.length &&
    a.faceAppearance.length === b.faceAppearance.length &&
    a.faceAppearance.every(Number.isFinite) && b.faceAppearance.every(Number.isFinite) &&
    a.faceAppearance.some(value => value !== 0) && b.faceAppearance.some(value => value !== 0);
  if (usableFaces && a.view !== 'unknown' && b.view !== 'unknown') {
    const face = Math.max(cosine(a.faceAppearance!, b.faceAppearance!), cosine(a.faceAppearance!, b.mirroredFaceAppearance ?? []), cosine(a.mirroredFaceAppearance ?? [], b.faceAppearance!));
    const weight = a.view === 'front' && b.view === 'front' ? 0.65 : 0.45;
    return { score: weight * face + (0.85-weight) * appearance + 0.10 * color + 0.05 * shape, basis: 'face-appearance' };
  }
  return { score: 0.8 * appearance + 0.15 * color + 0.05 * shape, basis };
}
type PetQuery = PetFeatures & { media_id?: number; id?: number; rejected_pet_ids?: number[] };
export function rankPets(query: PetQuery, references: PetReference[], limit = 3): PetCandidate[] {
  const groups = new Map<number, Array<{score:number;basis:PetCandidate['basis'];key:string}>>();
  const rejected = new Set(query.rejected_pet_ids ?? []);
  const priority = (basis:PetCandidate['basis']) => query.view==='rear' ? 0 : basis==='face-appearance' ? 0 : basis==='appearance' ? 1 : 2;
  references.forEach((reference,index) => {
    if (reference.features.kind !== query.kind || rejected.has(reference.petId) || query.media_id!==undefined && reference.mediaId===query.media_id || query.id!==undefined && reference.detectionId===query.id) return;
    const comparison=comparePets(query,reference.features);
    if (comparison.score<=0) return;
    const rows=groups.get(reference.petId) ?? [];
    rows.push({...comparison,key:reference.mediaId===undefined?`reference:${index}`:`photo:${reference.mediaId}`});groups.set(reference.petId,rows);
  });
  const candidates:PetCandidate[]=[];
  for(const [petId,rows] of groups) {
    // Compare like evidence. A body-only reference must never override a face
    // comparison, and a duplicate crop from one photo must not count twice.
    const bestBasis=Math.min(...rows.map(row=>priority(row.basis)));
    const unique=new Map<string,typeof rows[number]>();
    for(const row of rows.filter(row=>priority(row.basis)===bestBasis))if(!unique.has(row.key)||unique.get(row.key)!.score<row.score)unique.set(row.key,row);
    const supported=[...unique.values()].sort((a,b)=>b.score-a.score).slice(0,3);
    const mean=supported.reduce((sum,row)=>sum+row.score,0)/supported.length;
    candidates.push({petId,score:.5*supported[0].score+.5*mean,basis:supported[0].basis,referenceCount:supported.length});
  }
  return candidates.sort((a,b)=>priority(a.basis)-priority(b.basis)||b.score-a.score||a.petId-b.petId).slice(0,limit);
}
// Candidate retrieval cutoff only: 0.60 is NOT a claimed 60% accuracy.
// No automatic identity linking until independently measured false-link rates
// and model/view-specific calibration are available. Rear/unknown always abstain.
export function recognizePet(query: PetQuery, references: PetReference[]): RecognitionResult {
  const candidates = rankPets(query, references,Infinity).filter(candidate => candidate.score >= 0.60).slice(0,3);
  return { state: query.view === 'rear' ? 'rear-review' : candidates.length ? 'needs-review' : 'unregistered', candidates, autoPetId: null, ambiguous: candidates.length>1 && Math.abs(candidates[0].score-candidates[1].score)<.05 };
}
export function withView(features: PetFeatures, view: PetFeatures['view']): PetFeatures {
  return { ...features, view, viewSource: view === 'unknown' ? 'unknown' : 'user',
    appearance: view === 'rear' ? [] : features.appearance,
    mirroredAppearance: view === 'rear' ? [] : features.mirroredAppearance,
    faceBox: view === 'rear' || view === 'unknown' ? undefined : features.faceBox,
    faceAppearance: view === 'rear' || view === 'unknown' ? [] : features.faceAppearance,
    mirroredFaceAppearance: view === 'rear' || view === 'unknown' ? [] : features.mirroredFaceAppearance };
}
