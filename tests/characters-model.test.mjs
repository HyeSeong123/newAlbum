import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/characters/models.ts', import.meta.url),'utf8');
const { outputText } = ts.transpileModule(source.replace('import definitions from "./data/characterDefinitions.json";',
  `const definitions = ${readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url),'utf8')};`),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { characterDefinitions, nextDialogue, characterName, starterSnapshot, companionLabel, dialogueLines, growthStageName, growthProgress, stageNames } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
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

test('every species has four unique stages, a distinct personality and complete situational dialogue', () => {
  assert.deepEqual(stageNames.slice(1), ['새싹', '성장 1', '성장 2', '완성']);
  assert.equal(new Set(characterDefinitions.map(d => d.personality.archetype)).size, characterDefinitions.length);
  assert.equal(new Set(characterDefinitions.map(d => d.personality.signatureAnimation)).size, characterDefinitions.length);
  for (const def of characterDefinitions) {
    assert.equal(def.growthStages.length, 4);
    assert.equal(new Set(def.growthStages.map(stage => stage.name)).size, 4);
    assert.ok(def.personality.keywords.length >= 3);
    for (let stage = 1; stage <= 4; stage++) {
      assert.ok(growthStageName(def, stage).length > 0);
      assert.ok(def.growthStages[stage - 1].description.length > 10);
      assert.ok(def.dialogues.stages[String(stage)].length > 0);
    }
    for (const context of ['greeting','photoAdded','regionMemory','highAffection','growth','selectedAsMain','idle','sad']) {
      assert.ok(def.dialogues.situations[context].length >= 2);
    }
  }
});

test('growth changes geometry, beyond colours, titles and metadata', () => {
  const geometry = svg => svg.replace(/<title>[\s\S]*?<\/title>/g,'').replace(/(?:fill|stroke|data-stage|data-character)="[^"]*"/g,'');
  const finals = [];
  for (const def of characterDefinitions.filter(d => !d.originalAssetPath)) {
    const assets = [1,2,3,4].map(stage => readFileSync(new URL(`../public${def.assetPath}/stage${stage}-idle.svg`, import.meta.url),'utf8'));
    assert.equal(new Set(assets.map(geometry)).size, 4, def.id);
    finals.push(geometry(assets[3]));
  }
  assert.equal(new Set(finals).size, finals.length);
});

test('sweet potato growth waits for the completed younger brother and uses its own growth count', () => {
  const snapshot = starterSnapshot();
  const def = characterDefinitions.find(d => d.id === 'sweet-potato');
  const potato = snapshot.characters.find(c => c.id === 'potato');
  const sweet = { ...snapshot.characters.find(c => c.id === 'sweet-potato'), regionPhotoCount: 100, growthPhotoCount: 0 };
  assert.equal(growthProgress(def, sweet, [potato, sweet]).ready, false);
  const ready = growthProgress(def, sweet, [{ ...potato, growthStage: 4 }, sweet]);
  assert.equal(ready.ready, true);
  assert.equal(ready.remaining, 10);
  assert.equal(ready.count, 0);
  const next = growthProgress(def, { ...sweet, growthStage: 2, growthPhotoCount: 10 }, [{ ...potato, growthStage: 4 }, sweet]);
  assert.equal(next.remaining, 20);
  assert.equal(next.nextStage, 3);
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
