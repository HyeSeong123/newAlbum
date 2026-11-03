import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readBaseline, exportCorpus } from '../scripts/gomgomi-training/cli.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'gomgomi-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const folder of ['scripts/gomgomi-training', 'src/features/characters/data', 'models/gomi-lora-v4/data']) {
    await mkdir(path.join(dir, folder), { recursive: true });
  }
  const project = { schemaVersion: 1, name: '곰고미', targetCharacterCount: 18, baselineDirectory: 'models/gomi-lora-v4/data' };
  const definitions = [{ id: 'gomi', defaultName: '고미' }];
  const trainRow = { id: 'a', group: 'a', source: 'user-provided', prompt: '산책할 때', reply: '내가 길 정할게.', context: { action: 'walk' } };
  const validationRow = { id: 'b', group: 'b', source: 'agent-authored-evaluation', prompt: '쉴 때', reply: '옆자리 비워 둬.' };
  const train = JSON.stringify(trainRow) + '\n', validation = JSON.stringify(validationRow) + '\n';
  const data = path.join(dir, project.baselineDirectory);
  await writeFile(path.join(dir, 'scripts/gomgomi-training/project.json'), JSON.stringify(project));
  await writeFile(path.join(dir, 'src/features/characters/data/characterDefinitions.json'), JSON.stringify(definitions));
  await writeFile(path.join(data, 'train.jsonl'), train);
  await writeFile(path.join(data, 'validation.jsonl'), validation);
  await writeFile(path.join(data, 'manifest.json'), JSON.stringify({
    character: 'gomi', model: 'Qwen/Qwen3-4B-Instruct-2507', trainCount: 1, validationCount: 1,
    trainSha256: sha(train), validationSha256: sha(validation), qualityApproved: false,
  }));
  return { dir, data, train, validation, trainRow };
}

test('checks the real frozen corpus and exposes the unassigned 18th character', async () => {
  const result = await readBaseline(root);
  assert.equal(result.report.trainCount, 465);
  assert.equal(result.report.validationCount, 64);
  assert.equal(result.registry.registeredCount, 17);
  assert.equal(result.registry.pendingCount, 1);
  assert.equal(result.source.qualityApproved, false);
});
test('rejects corrupted source bytes before producing any dataset', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.data, 'train.jsonl'), f.train + ' ');
  await assert.rejects(readBaseline(f.dir), /hash mismatch/i);
});
test('exports every original row field and leaves the input bytes intact', async t => {
  const f = await fixture(t), dest = path.join(f.dir, 'gomgomi-training-output', 'run-a');
  const result = await exportCorpus(f.dir, dest);
  const exported = JSON.parse((await readFile(path.join(dest, 'train.jsonl'), 'utf8')).trim());
  assert.deepEqual(exported, { ...f.trainRow, characterId: 'gomi' });
  assert.equal(await readFile(path.join(f.data, 'train.jsonl'), 'utf8'), f.train);
  assert.equal(await readFile(path.join(f.data, 'validation.jsonl'), 'utf8'), f.validation);
  const manifest = JSON.parse(await readFile(path.join(dest, 'manifest.json'), 'utf8'));
  assert.equal(result.complete, true);
  assert.equal(manifest.qualityApproved, false);
  assert.equal(manifest.trainingExecuted, false);
  assert.equal(manifest.deployedToApp, false);
  assert.equal(manifest.promptFormat, 'legacy-chatml-model-specific');
  assert.equal(manifest.source.model, 'Qwen/Qwen3-4B-Instruct-2507');
  assert.equal(manifest.output.trainSha256, sha(await readFile(path.join(dest, 'train.jsonl'))));
});
test('refuses an existing destination without overwriting files', async t => {
  const f = await fixture(t), dest = path.join(f.dir, 'gomgomi-training-output', 'existing');
  await mkdir(dest, { recursive: true }); await writeFile(path.join(dest, 'keep.txt'), '보존');
  await assert.rejects(exportCorpus(f.dir, dest), /EEXIST/);
  assert.equal(await readFile(path.join(dest, 'keep.txt'), 'utf8'), '보존');
});
test('refuses output inside tracked source folders', async t => {
  const f = await fixture(t);
  await assert.rejects(exportCorpus(f.dir, path.join(f.data, 'new-export')), /output directory/i);
});
test('refuses a repository output parent redirected by a symlink into source data', async t => {
  const f = await fixture(t);
  await symlink(f.data, path.join(f.dir, 'gomgomi-training-output'), 'dir');
  await assert.rejects(exportCorpus(f.dir, path.join(f.dir, 'gomgomi-training-output', 'unsafe')), /output directory/i);
});
test('the CLI prints useful status and returns a failing exit code for unsupported commands', () => {
  const cli = path.join(root, 'scripts/gomgomi-training/cli.mjs');
  const status = spawnSync(process.execPath, [cli, 'status'], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  const result = JSON.parse(status.stdout);
  assert.equal(result.project, '곰고미');
  assert.equal(result.registry.pendingCount, 1);
  const invalid = spawnSync(process.execPath, [cli, 'train'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /status|check|export/);
});

test('rejects nested symlink output before creating any source directories', async t => {
  const f = await fixture(t);
  await symlink(f.data, path.join(f.dir, 'gomgomi-training-output'), 'dir');
  await assert.rejects(
    exportCorpus(f.dir, path.join(f.dir, 'gomgomi-training-output', 'new-parent', 'unsafe')),
    /output directory/i,
  );
  await assert.rejects(stat(path.join(f.data, 'new-parent')), { code: 'ENOENT' });
});
