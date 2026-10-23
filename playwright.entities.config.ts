import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// UI/IPC fixtures exercise classification controls without downloading or loading
// recognition weights. Inference accuracy remains a separate validation scope.
export default defineConfig({
  ...base,
  testMatch: process.env.ENTITY_UX_BASELINE === '1' ? ['**/entity-visuals.spec.ts'] : [
    '**/help-review.spec.ts',
    '**/analysis-lifecycle.spec.ts',
    '**/entity-ux.spec.ts', '**/entity-visuals.spec.ts', '**/people-controls.spec.ts',
    '**/unknown-faces.spec.ts', '**/manual-photos.spec.ts', '**/pets.spec.ts',
    '**/pet-review.spec.ts', '**/people.spec.ts', '**/export-media.spec.ts',
    '**/mobile-polish.spec.ts', '**/mobile-layout.spec.ts',
  ],
  grepInvert: /local models detect faces|analysis keeps saved photos|main action retries a completed photo/,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/entity-results.json' }]],
  outputDir: 'test-results/entity-ux',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

