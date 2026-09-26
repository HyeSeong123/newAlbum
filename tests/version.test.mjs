import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpVersion, checkVersion } from '../scripts/version.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'album-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src-tauri'));
  const values = {
    'package.json': '{"name":"local-album-manager","version":"0.1.9"}',
    'package-lock.json': '{"version":"0.1.9","packages":{"":{"version":"0.1.9"},"node_modules/example":{"version":"0.1.9"}}}',
    'src-tauri/tauri.conf.json': '{"version":"0.1.9","identifier":"com.oraedameun.album"}',
    'src-tauri/Cargo.toml': '[package]\nname = "oraedameun"\nversion = "0.1.9"\n\n[dependencies]\nexample = "0.1.9"\n',
    'src-tauri/Cargo.lock': '[[package]]\nname = "example"\nversion = "0.1.9"\n\n[[package]]\nname = "oraedameun"\nversion = "0.1.9"\n',
  };
  for (const [file, value] of Object.entries(values)) await writeFile(join(root, file), value);
  return root;
}

for (const [kind, expected] of [['patch', '0.1.10'], ['minor', '0.2.0'], ['major', '1.0.0']]) {
  test(`${kind} updates every app version while leaving dependencies and identity alone`, async t => {
    const root = await fixture(t);
    assert.equal(await bumpVersion(root, kind), expected);
    assert.equal(await checkVersion(root, `v${expected}`), expected);
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(lock.packages['node_modules/example'].version, '0.1.9');
    assert.match(await readFile(join(root, 'src-tauri/Cargo.lock'), 'utf8'), /name = "example"\nversion = "0.1.9"/);
    assert.equal(JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).identifier, 'com.oraedameun.album');
  });
}

test('mismatched tags or version files stop a release before files change', async t => {
  const root = await fixture(t);
  await assert.rejects(checkVersion(root, 'v0.2.0'), /태그/);
  await writeFile(join(root, 'src-tauri/tauri.conf.json'), '{"version":"0.2.0"}');
  const before = await readFile(join(root, 'package.json'), 'utf8');
  await assert.rejects(bumpVersion(root, 'patch'), /일치/);
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), before);
  await assert.rejects(bumpVersion(root, 'prerelease'), /patch/);
});
