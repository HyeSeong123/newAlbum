import { execFileSync } from 'node:child_process';
// Restore the existing offline engines. Model integrity checks remain in each
// preparation script; the research trainer is not part of app startup/build.
for (const script of ['prepare-recognition-models', 'verify-recognition-models', 'prepare-face-models', 'prepare-pet-models']) execFileSync(process.execPath, [`scripts/${script}.mjs`], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/generate-character-assets.mjs'], { stdio: 'inherit' });
