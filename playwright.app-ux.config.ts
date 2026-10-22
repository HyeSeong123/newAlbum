import { defineConfig } from '@playwright/test';
import base from './playwright.entities.config';
export default defineConfig({...base,testMatch:['**/app-ux-audit.spec.ts'],workers:1,timeout:90000,reporter:[['list'],['json',{outputFile:'test-results/app-ux-results.json'}]]});
