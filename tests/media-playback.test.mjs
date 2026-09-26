import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function loadSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
  return module.exports;
}

const { getMediaType, isSupportedMedia, MEDIA_FILE_ACCEPT } = await loadSource('../src/features/media/mediaService.ts');
const { normalizeLocalFilePath, resolveMediaSource } = await loadSource('../src/features/media/mediaSource.ts');
const { MediaPlayback } = await loadSource('../src/components/MediaPlayback.tsx');

test('registration classifies supported extensions without relying on browser MIME metadata', () => {
  for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'heic']) assert.equal(getMediaType(`사진.${extension.toUpperCase()}`), 'image');
  for (const extension of ['mp4', 'mov', 'avi', 'mkv', 'webm']) assert.equal(getMediaType(`영상.${extension.toUpperCase()}`), 'video');
  for (const extension of ['mp3', 'wav', 'flac', 'm4a']) assert.equal(getMediaType(`음원.${extension.toUpperCase()}`), 'audio');
  for (const name of ['text.txt', 'photo.jpg.exe', 'mp3', 'picture.', 'file.constructor']) assert.equal(isSupportedMedia(name), false);
  assert.deepEqual(MEDIA_FILE_ACCEPT.split(',').filter((extension) => !isSupportedMedia(`file${extension}`)), []);
});

test('browser-selected media use their session URL without calling the desktop bridge', () => {
  const item = { filePath: '선택한 로컬 파일/산책.MOV', previewUrl: 'blob:local-test-recording' };
  assert.equal(resolveMediaSource(item, () => { throw new Error('Unexpected native file access'); }), item.previewUrl);
  assert.equal(resolveMediaSource({ filePath: 'C:/Pictures/산책.MOV' }), null);
  assert.equal(resolveMediaSource({ filePath: '' }, () => 'invalid'), null);
});

test('desktop media sources normalize Windows drive and UNC prefixes before conversion', () => {
  for (const [path, expected] of [
    [String.raw`\\?\C:\Pictures\산책 #1.mov`, String.raw`C:\Pictures\산책 #1.mov`],
    [String.raw`\\?\UNC\server\album\기록.wav`, String.raw`\\server\album\기록.wav`],
    ['/home/photos/recording.webm', '/home/photos/recording.webm'],
  ]) {
    assert.equal(normalizeLocalFilePath(path), expected);
    let convertedPath;
    const source = resolveMediaSource({ filePath: path }, (value) => { convertedPath = value; return 'asset://converted-file'; });
    assert.equal(convertedPath, expected);
    assert.equal(source, 'asset://converted-file');
  }
});

test('video markup connects the local source to native controls without autoplay', () => {
  const html = renderToStaticMarkup(createElement(MediaPlayback, { kind: 'video', fileName: '산책.mov', source: 'blob:video-recording' }));
  assert.match(html, /<video\b[^>]*src="blob:video-recording"/);
  assert.match(html, /controls=""/);
  assert.match(html, /playsInline=""/);
  assert.match(html, /preload="metadata"/);
  assert.match(html, /aria-label="산책.mov 영상 재생"/);
  assert.doesNotMatch(html, /<audio\b|autoplay/i);
});

test('audio markup exposes native playback controls and the file name', () => {
  const html = renderToStaticMarkup(createElement(MediaPlayback, { kind: 'audio', fileName: '바람.wav', source: 'blob:audio-recording' }));
  assert.match(html, /<audio\b[^>]*src="blob:audio-recording"[^>]*controls=""/);
  assert.match(html, /aria-label="바람.wav 음원 재생"/);
  assert.doesNotMatch(html, /<video\b|autoplay/i);
});

test('missing media sources show recovery guidance without an empty media URL', () => {
  const html = renderToStaticMarkup(createElement(MediaPlayback, { kind: 'video', fileName: 'missing.mp4', source: null }));
  assert.match(html, /role="status"/);
  assert.match(html, /파일을 다시 가져온 뒤 열어 주세요/);
  assert.doesNotMatch(html, /<video\b|src=""/);
});
