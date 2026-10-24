import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const result = await build({
  stdin: { contents: `export { EntitySelectionBar } from './src/features/entities/EntitySelectionBar'; export { EntityAssignmentDialog } from './src/features/entities/EntityAssignmentDialog';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', loader: { '.css': 'empty' }, jsx: 'automatic',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const { EntitySelectionBar, EntityAssignmentDialog } = module.exports;
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const noop = () => {};

test('selection counts use the unit appropriate to photos, people, pets and faces', () => {
  for (const [unit, counter] of [['사진', '장'], ['인물', '명'], ['반려동물', '마리'], ['얼굴', '개']]) {
    const html = renderToStaticMarkup(createElement(EntitySelectionBar, { count: 2, unit, onAll: noop, onClear: noop, onClose: noop }));
    assert.ok(html.includes(`${unit} 2${counter} 선택`), `${unit} should use ${counter}`);
  }
});

test('assignment does not offer an empty existing target and identifies photo count', () => {
  const html = renderToStaticMarkup(createElement(EntityAssignmentDialog, { kind: 'pet', entries: [], count: 3, unit: '사진', onSave: noop, onClose: noop }));
  assert.match(html, /사진 3장/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>기존 반려동물<\/button>/);
  assert.match(html, /aria-label="새 반려동물 이름"/);
});
