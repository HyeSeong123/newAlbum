import { execFileSync } from 'node:child_process';
// Product builds never download, copy or run pretrained recognition models.
execFileSync(process.execPath, ['scripts/prepare-recognition-models.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/verify-recognition-models.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/generate-character-assets.mjs'], { stdio: 'inherit' });
