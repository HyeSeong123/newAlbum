// Raster growth stages are source assets; other species use botanical SVGs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderCharacterSvg } from './character-art.mjs';
const definitions = JSON.parse(readFileSync('src/features/characters/data/characterDefinitions.json', 'utf8'));
for (const definition of definitions) {
  if (definition.stageAssetPaths) {
    if (definition.stageAssetPaths.length !== definition.maxStage || definition.stageAssetPaths.some(path => !existsSync(`public${path}`))) {
      throw new Error(`${definition.id}: 성장 단계 그림이 누락되었습니다. public/characters 파일을 확인해 주세요.`);
    }
    continue;
  }
  mkdirSync(`public${definition.assetPath}`, { recursive: true });
  for (let stage = 1; stage <= definition.maxStage; stage++) for (const expression of ['idle', 'happy', 'sad', 'grow']) {
    if (definition.originalAssetPath && stage === definition.maxStage) continue;
    writeFileSync(`public${definition.assetPath}/stage${stage}-${expression}.svg`, renderCharacterSvg(definition, stage, expression));
  }
}
