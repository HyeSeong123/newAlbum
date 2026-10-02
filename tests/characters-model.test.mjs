import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/characters/models.ts', import.meta.url),'utf8');
const { outputText } = ts.transpileModule(source.replace('import definitions from "./data/characterDefinitions.json";',
  `const definitions = ${readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url),'utf8')};`),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { characterDefinitions, nextDialogue, characterName, starterSnapshot, companionLabel, dialogueLines } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const regionSource = readFileSync(new URL('../src/features/map/regions.ts', import.meta.url),'utf8');
const { REGION_NAMES } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(regionSource,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`);

test('each region has one definition, four increasing thresholds and complete local expression assets', () => {
  assert.deepEqual(characterDefinitions.map(def => def.regionCode).sort(), Object.keys(REGION_NAMES).sort());
  assert.equal(new Set(characterDefinitions.map(def => def.id)).size, characterDefinitions.length);
  for (const def of characterDefinitions) {
    assert.deepEqual(Object.values(def.growthConditions), [def.defaultUnlocked ? 0 : 1,10,30,60]);
    assert.ok(def.dialogues.all.length >= 2);
    for (let stage=1; stage<=4; stage++) for (const expression of ['idle','happy','sad','grow']) {
      const asset = new URL(`../public${def.originalAssetPath || `${def.assetPath}/stage${stage}-${expression}.svg`}`, import.meta.url);
      assert.ok(existsSync(asset));
      if (!def.originalAssetPath) assert.match(readFileSync(asset,'utf8'), /^<svg[\s\S]*<\/svg>$/);
    }
    assert.equal(characterName(def),def.defaultName);
    assert.equal(characterName(def,{customName:'별이'}),'별이');
  }
});
test('random dialogue never immediately repeats, including both endpoints', () => {
  for (let previous=0; previous<4; previous++) for (const random of [() => 0, () => .999999]) {
    const next = nextDialogue(['a','b','c','d'],previous,random);
    assert.ok(next >= 0 && next < 4 && next !== previous);
  }
});

test('the two brothers are available without photographs, with potato as the default main', () => {
  const snapshot = starterSnapshot();
  assert.deepEqual(snapshot.characters.map(c => c.id), ['potato', 'sweet-potato']);
  assert.deepEqual(snapshot.events, []);
  assert.equal(snapshot.characters.filter(c => c.isMain).length, 1);
  assert.equal(snapshot.characters.find(c => c.isMain).id, 'potato');
  assert.ok(snapshot.characters.every(c => c.growthStage === 1 && c.regionPhotoCount === 0));
  const potato = characterDefinitions.find(c => c.id === 'potato');
  const sweet = characterDefinitions.find(c => c.id === 'sweet-potato');
  assert.equal(potato.originalAssetPath, '/brand/gamjassak-symbol.png');
  assert.match(companionLabel(potato), /동생/);
  assert.match(companionLabel(sweet), /형/);
  assert.ok(dialogueLines(potato, 1).some(line => line.includes('GPS')));
  assert.ok(dialogueLines(sweet, 1).some(line => line.includes('응원')));
});
