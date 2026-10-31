import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildDataset } from './export-data.mjs';
import { parseUserDialogues, scenePrompt } from './import-dialogues.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseAdditionalDialogues(text) {
  return parseUserDialogues(text, { sectionCount: 4, quotesPerSection: 30, idPrefix: 'user120',
    coreLabel: '상황 설정', rulesHeading: '## 학습 시 적용할 추가 성격 지침' });
}

export async function buildAdditionalDataset() {
  const previous = await buildDataset();
  const bytes = await readFile(new URL('./user-dialogues-120.txt', import.meta.url));
  const source = parseAdditionalDialogues(bytes.toString('utf8'));
  const evalBytes = await readFile(new URL('./persona-evaluation-v4.json', import.meta.url));
  const evaluations = JSON.parse(evalBytes);
  const train = [...previous.train], validation = [...previous.validation];
  for (const row of source.examples) {
    const section = source.sections.find(item => item.number === row.section);
    train.push({ id: row.id, group: row.id, kind: 'user-dialogue-120', source: 'user-provided',
      section: row.section, situation: row.situation, prompt: scenePrompt(row.situation, section.core), reply: row.speech });
  }
  for (const row of evaluations) {
    const section = source.sections.find(item => item.number === row.section);
    validation.push({ id: `eval-v4-${row.id}`, group: `eval-v4-${row.id}`, kind: 'persona-evaluation-v4',
      source: 'agent-authored-evaluation', section: row.section, situation: row.situation,
      prompt: scenePrompt(row.situation, section.core), reply: row.speech });
  }
  const manifest = { ...previous.manifest, schemaVersion: 4, source: 'user-120-plus-v3-replay',
    previousTrainingCount: previous.train.length, previousValidationCount: previous.validation.length,
    newUserDialogueCount: source.examples.length, newUserDialogueSourceSha256: sha(bytes),
    newEvaluationCount: evaluations.length, newEvaluationSourceSha256: sha(evalBytes),
    trainCount: train.length, validationCount: validation.length,
    splitPolicy: 'unchanged v3 rows; all additional120 train; separate16 agent-authored new phrasings in known topics; not independent user testing' };
  return { train, validation, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/gomi-training/export-additional.mjs NEW_OUTPUT_DIRECTORY');
  const { train, validation, manifest } = await buildAdditionalDataset();
  await mkdir(output, { recursive: true });
  for (const [name, rows] of [['train', train], ['validation', validation]]) {
    const bytes = rows.map(({ context, ...row }) => JSON.stringify(row)).join('\n') + '\n';
    await writeFile(path.join(output, `${name}.jsonl`), bytes, { flag: 'wx' });
    manifest[`${name}Sha256`] = sha(bytes);
  }
  for (const filename of ['examples.json', 'persona-references.json', 'user-dialogues-240.txt', 'persona-evaluation-v3.json',
    'user-dialogues-120.txt', 'persona-evaluation-v4.json']) {
    await writeFile(path.join(output, filename), await readFile(new URL(filename, import.meta.url)), { flag: 'wx' });
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(manifest));
}
