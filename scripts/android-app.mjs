import { readFile } from 'node:fs/promises';

const base = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const android = JSON.parse(await readFile(new URL('../src-tauri/tauri.android.conf.json', import.meta.url), 'utf8'));
export const androidAppId = android.identifier ?? base.identifier;
export const legacyAndroidAppId = base.identifier;

const managedMediaPath = new RegExp(`^/data/(?:user/0|data)/${androidAppId.replaceAll('.', '\\.')}/imported-media-v1/[A-Za-z0-9_./-]+$`);
// The GPS regression may rewrite only synthetic managed copies owned by the
// current app. Never accept another package, an original photo, or traversal.
export function isAndroidManagedMediaPath(file) {
  return typeof file === 'string' && managedMediaPath.test(file)
    && !file.split('/').some(segment => segment === '.' || segment === '..');
}
