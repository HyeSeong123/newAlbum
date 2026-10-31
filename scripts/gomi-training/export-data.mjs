import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { modelUrl } from '../ts-module-loader.mjs';
import { loadUserDialogues, scenePrompt } from './import-dialogues.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const heldOut = new Set(['touch-0', 'pet-4', 'walk-2', 'treat-3', 'rest-1', 'play-0', 'sleepy-3', 'irritated-4']);

export async function buildDataset() {
  const examplesBytes = await readFile(new URL('./examples.json', import.meta.url));
  const examples = JSON.parse(examplesBytes);
  const personaBytes = await readFile(new URL('./persona-references.json', import.meta.url));
  const persona = JSON.parse(personaBytes);
  const corpus = await loadUserDialogues();
  const evaluationBytes = await readFile(new URL('./persona-evaluation-v3.json', import.meta.url));
  const evaluation = JSON.parse(evaluationBytes);
  const definitions = JSON.parse(await readFile(path.join(root, 'src/features/characters/data/characterDefinitions.json')));
  const definition = definitions.find(item => item.id === 'gomi');
  const { buildTouchPrompt } = await import(await modelUrl('features/characters/companionTouch.ts'));
  const { gomiClickLines } = await import(await modelUrl('features/characters/gomiAffinity.ts'));
  const train = [], validation = [];
  for (const [scenario, tiers] of Object.entries(examples)) {
    for (let tier = 0; tier < 5; tier++) {
      const affection = [0, 20, 30, 60, 90][tier];
      const group = `${scenario}-${tier}`;
      const mood = ['sleepy', 'irritated'].includes(scenario) ? scenario : 'calm';
      const context = {
        definition, owned: { id: 'gomi', customName: '', affection, growthStage: 6 },
        memory: { version: 1, mood, energy: mood === 'calm' ? 3 : 0, history: [] },
        action: ['sleepy', 'irritated'].includes(scenario) ? 'touch' : scenario,
        fallback: gomiClickLines[tier][0], previous: [], hour: mood === 'calm' ? 15 : 23,
        appearance: '연한 갈색 곱슬털과 풍성한 귀를 가진 작은 강아지',
      };
      // Mirrors CompanionModelRegistry.DIALOGUE.preparePrompt before JNI inference.
      const prompt = buildTouchPrompt(context)
        .replace(/<think>\n\n<\/think>\n\n$/, '').replaceAll('/no_think', '');
      for (const [index, reply] of tiers[tier].entries()) {
        (heldOut.has(group) ? validation : train).push({ id: `${group}-${index}`, group, kind: 'interaction',
          source: 'agent-authored-draft-v2', prompt, reply, context });
      }
    }
  }
  // References describe supplied hypothetical scenes, not new app sensors or detected events.
  // User-authored speech stays verbatim. Silent behavior must not become invented dialogue.
  for (const reference of persona.examples.filter(item => typeof item.speech === 'string')) {
    const system = [
      '너는 감자싹의 강아지 고미다. 짧고 자연스러운 반말로 직접 하는 말만 출력한다.',
      ...persona.traits,
      '집사는 고미의 주인이다. 집사가 고미에게 하는 말이 아니라 고미가 집사나 상대에게 하는 말을 답한다.',
      '아래는 사용자가 성격 학습을 위해 가정한 장면이다. 실제 관찰이나 GPS 기록이 아니다.',
      '제공하지 않은 일이 이미 일어났다고 주장하지 않는다. 사진·일기·사생활을 안다고 말하지 않는다.',
      '괄호 지문·동작 설명·설정 설명·이모지 대신 고미의 대사 1~2문장, 70자 이내만 출력한다.',
    ].join('\n');
    const user = [reference.situation, ...reference.behavior, '이 장면에서 고미가 직접 하는 한마디를 말해.'].join(' ');
    const prompt = `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
    train.push({ id: `reference-${reference.id}`, group: `reference-${reference.id}`, kind: 'persona-reference',
      source: 'user-provided', referenceId: reference.id, prompt, reply: reference.speech });
  }
  for (const row of corpus.examples) {
    const section = corpus.sections.find(item => item.number === row.section);
    train.push({ id: row.id, group: row.id, kind: 'user-dialogue-240', source: 'user-provided',
      section: row.section, situation: row.situation,
      prompt: scenePrompt(row.situation, section.core), reply: row.speech });
  }
  for (const row of evaluation) {
    const section = corpus.sections.find(item => item.number === row.section);
    validation.push({ id: `eval-v3-${row.id}`, group: `eval-v3-${row.id}`, kind: 'persona-evaluation',
      source: 'agent-authored-evaluation', section: row.section, situation: row.situation,
      prompt: scenePrompt(row.situation, section.core), reply: row.speech });
  }
  const manifest = {
    schemaVersion: 3, character: 'gomi', model: 'Qwen/Qwen3-4B-Instruct-2507',
    source: 'user-240-dialogues-and-existing-data-v3', personalData: false, usesPrivateAppRecords: false,
    additionalUserDialogueCount: corpus.examples.length, userDialogueSourceSha256: sha(corpus.bytes),
    heldOutPersonaEvaluationCount: evaluation.length, evaluationSourceSha256: sha(evaluationBytes),
    personaReferencesSha256: sha(personaBytes), verbalReferenceCount: persona.examples.filter(item => typeof item.speech === 'string').length,
    nonverbalReferenceIds: persona.examples.filter(item => item.speech === null).map(item => item.id),
    qualityApproved: false, splitPolicy: 'legacy scenario-affection groups; all 240 supplied lines train; new evaluation uses separately authored phrasings in known domains; no exact shared prompt or reply',
    examplesSha256: sha(examplesBytes), trainCount: train.length, validationCount: validation.length,
    promptSourceSha256: sha(await readFile(path.join(root, 'src/features/characters/companionTouch.ts'))),
    nativePromptSourceSha256: sha(await readFile(path.join(root, 'src-tauri/android/CompanionModelRegistry.java'))),
  };
  return { train, validation, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/gomi-training/export-data.mjs OUTPUT_DIRECTORY');
  const { train, validation, manifest } = await buildDataset();
  await mkdir(output, { recursive: true });
  for (const [name, rows] of [['train', train], ['validation', validation]]) {
    const bytes = rows.map(({ context, ...row }) => JSON.stringify(row)).join('\n') + '\n';
    await writeFile(path.join(output, `${name}.jsonl`), bytes, { flag: 'wx' });
    manifest[`${name}Sha256`] = sha(bytes);
  }
  for (const filename of ['examples.json', 'persona-references.json', 'user-dialogues-240.txt', 'persona-evaluation-v3.json']) {
    await writeFile(path.join(output, filename), await readFile(new URL(filename, import.meta.url)), { flag: 'wx' });
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(manifest));
}
