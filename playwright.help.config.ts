import { defineConfig } from '@playwright/test';
import base from './playwright.entities.config';

// Real shared-help interactions across desktop and Android-sized layouts.
// Native storage and recognition have their own Android installation gate.
export default defineConfig({ ...base, testMatch: [
  '**/help-spotlight.spec.ts', '**/help-review.spec.ts', '**/characters.spec.ts',
  '**/mobile-focus.spec.ts', '**/onboarding-empty.spec.ts', '**/analysis-lifecycle.spec.ts',
], reporter: [['list'], ['json', { outputFile: 'test-results/help-results.json' }]] });
