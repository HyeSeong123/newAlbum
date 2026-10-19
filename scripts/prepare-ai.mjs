import { execFileSync } from 'node:child_process';
if (process.env.VITE_AI_ENGINE === 'legacy') {
  if (process.env.GSS_COMMERCIAL === '1') throw new Error('LEGACY_AI_FORBIDDEN_IN_COMMERCIAL_BUILD');
  for (const script of ['prepare-recognition-models', 'verify-recognition-models', 'prepare-face-models', 'prepare-pet-models']) execFileSync(process.execPath, [`scripts/${script}.mjs`], { stdio: 'inherit' });
} else {
  console.log('Native AI: no pretrained model downloads; recognition remains unavailable until real models are trained.');
}
execFileSync(process.execPath, ['scripts/generate-character-assets.mjs'], { stdio: 'inherit' });
