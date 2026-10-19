import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Local JSON RGB records only. No URLs, external APIs, arbitrary image crawling,
// legacy checkpoints or teacher labels are accepted by this loader.
export async function loadDataset(manifestPath) {
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  if (manifest.schemaVersion !== 1 || manifest.task !== 'synthetic-rgb-classification' || !Array.isArray(manifest.records) || manifest.records.length < 2 || manifest.records.length > 10000) throw new Error('INVALID_DATA_MANIFEST');
  const root = await realpath(path.dirname(manifestPath)), train = [], validation = [];
  const hashes = new Map();
  for (const record of manifest.records) {
    if (!['train', 'validation'].includes(record.split) || typeof record.path !== 'string' || !record.id || !record.captureGroup || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error('INVALID_DATA_RECORD');
    const rights = record.rights;
    if (!rights || rights.commercialTraining !== true || rights.consentConfirmed !== true || rights.reviewed !== true || !rights.source || !rights.evidence || !rights.reviewer || !rights.reviewedAt) throw new Error('UNVERIFIED_DATA_RIGHTS');
    const filename = await realpath(path.resolve(root, record.path));
    if (!filename.startsWith(root + path.sep)) throw new Error('DATA_PATH_ESCAPE');
    const bytes = await readFile(filename);
    if (sha256(bytes) !== record.sha256) throw new Error('DATA_HASH_MISMATCH');
    if (hashes.has(record.sha256) && hashes.get(record.sha256) !== record.split) throw new Error('DUPLICATE_ACROSS_SPLITS');
    hashes.set(record.sha256, record.split);
    const image = JSON.parse(bytes);
    if (!Array.isArray(image.data) || image.data.some(x => !Number.isInteger(x) || x < 0 || x > 255)) throw new Error('INVALID_RGB_DATA');
    image.data = Uint8Array.from(image.data);
    (record.split === 'train' ? train : validation).push({ id: record.id, group: record.captureGroup, source: record.sourceId || record.sha256, label: record.label, image });
  }
  return { train, validation, manifestSha256: sha256(manifestBytes) };
}
