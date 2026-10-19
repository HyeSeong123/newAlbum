import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
if (process.env.VITE_AI_ENGINE !== 'legacy') {
  const files = await readdir('dist/assets');
  if (files.some(name => /^(person|pet)\.worker-/.test(name))) throw new Error('LEGACY_WORKER_LEAKED_IN_NATIVE_BUNDLE');
}
if (process.env.GSS_COMMERCIAL === '1' || process.env.TAURI_ENV_DEBUG === 'false') {
  execFileSync(process.execPath, ['scripts/native-ai/release-gate.mjs'], { stdio: 'inherit' });
} else {
  console.log('Development build only. Commercial release remains blocked; run npm run ai:release:check.');
}
