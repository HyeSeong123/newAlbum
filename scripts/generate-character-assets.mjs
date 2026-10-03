// Original vector companions. Potato uses its approved PNG in PotatoGrowthVisual.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderCharacterSvg } from './character-art.mjs';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json', 'utf8'));
for (const definition of definitions.filter(item => !item.originalAssetPath)) {
  mkdirSync(`public${definition.assetPath}`, { recursive: true });
  for (let stage = 1; stage <= 4; stage++) for (const expression of ['idle', 'happy', 'sad', 'grow']) {
    writeFileSync(`public${definition.assetPath}/stage${stage}-${expression}.svg`, renderCharacterSvg(definition, stage, expression));
  }
}
