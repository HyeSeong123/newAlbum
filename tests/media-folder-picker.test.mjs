import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mockIPC } from '@tauri-apps/api/mocks';

const bundle = await build({ entryPoints: ['src/services/tauriMediaService.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { chooseAndRegisterFolder, chooseExportDestination } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function nativeSession(android, handler) {
  globalThis.window = {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: android ? 'Android' : 'Windows' } });
  const calls = [];
  mockIPC((command, args) => { calls.push({ command, args }); return handler(command, args); });
  return calls;
}

test('Android folder import requests a photo starting location and cancellation never registers files', async () => {
  const calls = nativeSession(true, () => null);
  assert.deepEqual(await chooseAndRegisterFolder(), []);
  assert.deepEqual(calls, [{ command: 'choose_android_directory', args: { preferPictures: true } }]);
});

test('export destination selection does not inherit the import starting location', async () => {
  const calls = nativeSession(true, () => null);
  assert.equal(await chooseExportDestination(), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'choose_android_directory');
  assert.equal(calls[0].args?.preferPictures, undefined);
});

test('desktop folder import starts in the OS pictures folder and cancel performs no registration', async () => {
  const calls = nativeSession(false, command => command === 'plugin:dialog|open' ? null : 'C:\\Users\\sample\\Pictures');
  assert.deepEqual(await chooseAndRegisterFolder(), []);
  const dialog = calls.find(call => call.command === 'plugin:dialog|open');
  assert.equal(dialog.args.options.directory, true);
  assert.equal(dialog.args.options.defaultPath, 'C:\\Users\\sample\\Pictures');
  assert.equal(calls.some(call => call.command === 'register_paths'), false);
});

test('a missing desktop pictures folder still opens a usable folder picker', async () => {
  const calls = nativeSession(false, command => {
    if (command === 'plugin:dialog|open') return null;
    throw new Error('pictures directory unavailable');
  });
  assert.deepEqual(await chooseAndRegisterFolder(), []);
  const dialog = calls.find(call => call.command === 'plugin:dialog|open');
  assert.equal(dialog.args.options.defaultPath, undefined);
  assert.equal(dialog.args.options.directory, true);
});
