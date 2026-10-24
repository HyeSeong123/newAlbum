import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Scoped UI checks run with synthetic IPC data; native storage and AI inference
// remain covered by their existing installation/release checks.
export default defineConfig({
  ...base,
  testMatch: ['**/ux-convenience-*.spec.ts', '**/app-ux-audit.spec.ts'],
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } }],
  workers: 2,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/ux-convenience-results.json' }]],
  outputDir: 'test-results/ux-convenience',
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 120_000 },
});
