import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry, validateCorpus } from './core.mjs';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
const splitRows = bytes => bytes.toString('utf8').split(/\r?\n/u).filter(line => line.trim()).map(JSON.parse);
const serialize = value => JSON.stringify(value, null, 2) + '\n';

// Resolve nonexistent destinations through their nearest existing ancestor without creating anything.
async function projectedRealpath(target) {
  let current = target;
  const missing = [];
  for (;;) {
    try { return path.join(await realpath(current), ...missing); }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(current) === current) throw error;
      missing.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
}

export async function readBaseline(root = defaultRoot) {
  root = path.resolve(root);
  const project = await json(path.join(root, 'scripts/gomgomi-training/project.json'));
  if (project.schemaVersion !== 1 || typeof project.baselineDirectory !== 'string') throw new Error('unsupported project configuration');
  const dataDirectory = path.resolve(root, project.baselineDirectory);
  if (!within(await realpath(root), await realpath(dataDirectory))) throw new Error('baseline directory must be inside repository');
  const definitions = await json(path.join(root, 'src/features/characters/data/characterDefinitions.json'));
  const registry = buildRegistry(definitions, project.targetCharacterCount);
  const manifest = await json(path.join(dataDirectory, 'manifest.json'));
  if (manifest.character !== 'gomi' || typeof manifest.model !== 'string' || !manifest.model.trim()) throw new Error('unsupported baseline manifest');
  const corpus = {}, hashes = {};
  for (const split of ['train', 'validation']) {
    const bytes = await readFile(path.join(dataDirectory, split + '.jsonl'));
    hashes[split + 'Sha256'] = sha(bytes);
    if (hashes[split + 'Sha256'] !== manifest[split + 'Sha256']) throw new Error('hash mismatch: ' + split);
    corpus[split] = splitRows(bytes).map(row => {
      if (row.characterId && row.characterId !== manifest.character) throw new Error('baseline character mismatch: ' + row.id);
      return { ...row, characterId: manifest.character };
    });
    if (corpus[split].length !== manifest[split + 'Count']) throw new Error('count mismatch: ' + split);
  }
  const report = validateCorpus(corpus, registry.characters.map(character => character.id));
  return {
    project, registry, corpus, report,
    source: { directory: project.baselineDirectory, character: manifest.character, model: manifest.model, ...hashes,
      qualityApproved: manifest.qualityApproved === true },
  };
}

export async function exportCorpus(root = defaultRoot, destination) {
  const baseline = await readBaseline(root);
  const realRoot = await realpath(root);
  const dest = path.resolve(root, destination || 'gomgomi-training-output/first-import');
  const allowed = path.join(realRoot, 'gomgomi-training-output');
  if (within(realRoot, dest) && (!within(allowed, dest) || dest === allowed)) {
    throw new Error('output directory inside repository must be a new child of gomgomi-training-output');
  }
  // Validate before creating parents; an output symlink must never create even empty source directories.
  const actual = await projectedRealpath(dest);
  if (within(realRoot, actual) && (!within(allowed, actual) || actual === allowed)) {
    throw new Error('output directory resolves to a source folder');
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await mkdir(dest); // Exclusive: existing folders and symlinks are never reused.
  const output = {};
  for (const split of ['train', 'validation']) {
    const bytes = baseline.corpus[split].map(row => JSON.stringify(row)).join('\n') + '\n';
    await writeFile(path.join(dest, split + '.jsonl'), bytes, { flag: 'wx' });
    output[split + 'Sha256'] = sha(bytes);
    output[split + 'Count'] = baseline.corpus[split].length;
  }
  await writeFile(path.join(dest, 'registry.json'), serialize({
    ...baseline.registry, personaStatus: 'imported-metadata-needs-review',
  }), { flag: 'wx' });
  const manifest = {
    schemaVersion: 1, project: baseline.project.name, complete: true,
    promptFormat: 'legacy-chatml-model-specific',
    source: baseline.source, output,
    qualityApproved: false, trainingExecuted: false, deployedToApp: false,
    nextStep: '기존 모델 전용 자료입니다. 새 모델을 정한 뒤 해당 토크나이저로 프롬프트를 다시 구성해야 합니다.',
  };
  // Written last; a partially written directory without this manifest is never called complete.
  await writeFile(path.join(dest, 'manifest.json'), serialize(manifest), { flag: 'wx' });
  return { ...manifest, destination: dest };
}

async function main(args) {
  const [command = 'status', ...rest] = args;
  if (!['status', 'check', 'export'].includes(command)) throw new Error('사용법: status | check | export [--out 새폴더]');
  if (command !== 'export' && rest.length || command === 'export' && rest.length && (rest.length !== 2 || rest[0] !== '--out' || !rest[1].trim())) {
    throw new Error('사용법: status | check | export [--out 새폴더]');
  }
  if (command === 'export') return exportCorpus(defaultRoot, rest[1]);
  const baseline = await readBaseline();
  if (command === 'check') return {
    ...baseline.report, message: '기존 고미 자료 검사 통과. 학습 실행·품질·속도는 확인하지 않았습니다.',
    source: baseline.source,
  };
  return {
    project: baseline.project.name, phase: '학습자료 준비', registry: baseline.registry,
    legacyGomi: baseline.report, trainingExecuted: false, phoneSpeedVerified: false,
    notice: '캐릭터 성격 표시는 기존 앱 메타데이터입니다. 새 학습용 성격 검토는 별도로 필요합니다.',
    next: 'check로 검사하고 export로 새 작업 폴더를 만드세요. 18번째 캐릭터는 미정입니다.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => console.log(serialize(result))).catch(error => {
    console.error('곰고미 학습 도구: ' + error.message);
    process.exitCode = 1;
  });
}
