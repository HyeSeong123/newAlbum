import { readFile } from 'node:fs/promises';

const base = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const android = JSON.parse(await readFile(new URL('../src-tauri/tauri.android.conf.json', import.meta.url), 'utf8'));
export const androidAppId = android.identifier ?? base.identifier;
export const legacyAndroidAppId = base.identifier;
