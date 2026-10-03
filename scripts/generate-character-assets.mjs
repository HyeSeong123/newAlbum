// Completed potato preserves the approved PNG. Earlier phases are botanical art.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderCharacterSvg } from './character-art.mjs';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json', 'utf8'));
for (const definition of definitions) {
  mkdirSync(`public${definition.assetPath}`, { recursive: true });
  for (let stage = 1; stage <= definition.maxStage; stage++) for (const expression of ['idle', 'happy', 'sad', 'grow']) {
    if (definition.originalAssetPath && stage === definition.maxStage) continue;
    writeFileSync(`public${definition.assetPath}/stage${stage}-${expression}.svg`, renderCharacterSvg(definition, stage, expression));
  }
}
