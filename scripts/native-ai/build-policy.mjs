import { execFileSync } from 'node:child_process';
if (process.env.GSS_COMMERCIAL === '1' || process.env.TAURI_ENV_DEBUG === 'false') {
  execFileSync(process.execPath, ['scripts/native-ai/release-gate.mjs'], { stdio: 'inherit' });
} else {
  console.log('Development build only. Commercial release remains blocked; run npm run ai:release:check.');
}
