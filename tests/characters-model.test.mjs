import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/characters/models.ts', import.meta.url),'utf8');
const { outputText } = ts.transpileModule(source.replace('import definitions from "./data/characterDefinitions.json";',
  `const definitions = ${readFileSync(new URL('../src/features/characters/data/characterDefinitions.json', import.meta.url),'utf8')};`),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { characterDefinitions, nextDialogue, characterName } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('each region has one definition, four increasing thresholds and complete local expression assets', () => {
  assert.deepEqual(characterDefinitions.map(def => def.regionCode), ['KR-42','KR-46','KR-47','KR-49']);
  for (const def of characterDefinitions) {
    assert.deepEqual(Object.values(def.growthConditions), [1,10,30,60]);
    assert.ok(def.dialogues.all.length >= 2);
    for (let stage=1; stage<=4; stage++) for (const expression of ['idle','happy','sad','grow']) {
      assert.ok(existsSync(new URL(`../public${def.assetPath}/stage${stage}-${expression}.svg`, import.meta.url)));
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
