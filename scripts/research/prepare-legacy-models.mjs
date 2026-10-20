import { execFileSync } from 'node:child_process';
// Explicit research only: never writes into public or dist.
for (const name of ['face', 'pet']) execFileSync(process.execPath, [`scripts/prepare-${name}-models.mjs`], { stdio: 'inherit', env: { ...process.env, GAMJASSAK_AI_RESEARCH: '1' } });
