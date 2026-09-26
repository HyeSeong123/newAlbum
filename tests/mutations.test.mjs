import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function modelUrl(path, imports = {}) {
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isImportDeclaration(node) && imports[node.moduleSpecifier.text]) {
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause,
          ts.factory.createStringLiteral(imports[node.moduleSpecifier.text]), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    })] },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}

const { createKeyedTaskQueue } = await import(await modelUrl('services/keyedTaskQueue.ts'));
const { browserImportItems, retainMediaEdits } = await import(await modelUrl('features/media/browserImport.ts', {
  './mediaService': await modelUrl('features/media/mediaService.ts'),
}));
const { makeAlbumSpreads } = await import(await modelUrl('features/media/journalModel.ts'));
const { replaceMediaComments, saveMediaComments } = await import(await modelUrl('features/media/mediaComments.ts'));
const { updateCalendarEvent, saveCalendarEvents } = await import(await modelUrl('features/calendar/calendarModel.ts'));
const { exportFolderName } = await import(await modelUrl('features/export/exportModel.ts'));
const file = (name, extra = {}) => ({ name, lastModified: Date.UTC(2026, 8, 25), size: 1000, ...extra });

test('record writes are ordered while unrelated records can progress', async () => {
  const queue = createKeyedTaskQueue();
  const calls = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const first = queue('photo-1', async () => { calls.push('first'); await barrier; calls.push('first-done'); });
  const second = queue('photo-1', async () => { calls.push('second'); });
  await queue('photo-2', async () => { calls.push('unrelated'); });
  assert.deepEqual(calls, ['first', 'unrelated']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['first', 'unrelated', 'first-done', 'second']);
  await queue('photo-1', async () => { calls.push('new'); });
  assert.equal(calls.at(-1), 'new');
});

test('a rejected or synchronously throwing write does not poison later saves', async () => {
  const queue = createKeyedTaskQueue();
  const failed = queue('a', () => { throw new Error('disk full'); });
  const next = queue('a', async () => 42);
  await assert.rejects(failed, /disk full/);
  assert.equal(await next, 42);
});

test('browser imports deduplicate within a batch and across imports without allocating unused URLs', () => {
  const created = [];
  const createUrl = item => { created.push(item.name); return `blob:${created.length}`; };
  const imported = browserImportItems([file('one.JPG'), file('one.JPG'), file('notes.txt'), file('two.mp4')], [], createUrl);
  assert.deepEqual(created, ['one.JPG', 'two.mp4']);
  assert.deepEqual(imported.map(item => item.fileType), ['image', 'video']);
  assert.equal(new Set(imported.map(item => item.id)).size, 2);
  assert.equal(imported[0].takenAt, '2026-09-25');
  assert.deepEqual(browserImportItems([file('one.JPG')], imported, createUrl), []);
  assert.equal(created.length, 2);
  const otherFolder = browserImportItems([file('one.JPG', { webkitRelativePath: 'other/one.JPG' })], imported, createUrl);
  assert.equal(otherFolder.length, 1);
});

test('failed browser batches release the object URLs already allocated', () => {
  const revoked = [];
  let calls = 0;
  assert.throws(() => browserImportItems([file('one.jpg'), file('two.jpg')], [], () => {
    if (++calls === 2) throw new Error('allocation failed');
    return 'blob:first';
  }, url => revoked.push(url)), /allocation failed/);
  assert.deepEqual(revoked, ['blob:first']);
});

test('refreshing imported media retains edits but accepts fresh metadata and new records', () => {
  const old = { id: '1', rating: 4, comment: 'edited', favorite: true, viewCount: 7, width: 10 };
  const registered = [{ ...old, rating: 0, comment: '', favorite: false, viewCount: 1, width: 400 }, { id: '2' }];
  const refreshed = retainMediaEdits(registered, [old]);
  assert.deepEqual(refreshed[0], { ...old, width: 400 });
  assert.strictEqual(refreshed[1], registered[1]);
  assert.equal(registered[0].rating, 0);
});

test('album pairs retain the latest captions without changing the source objects', () => {
  const items = [
    { id: '1', fileType: 'image', width: 600, height: 900, comment: 'caption', takenAt: '2026-09-25' },
    { id: '2', fileType: 'image', width: 1600, height: 900, comment: ' ', takenAt: null },
  ];
  const updated = items.map(item => ({ ...item, comment: 'Updated caption', width: null, height: null }));
  const [spread] = makeAlbumSpreads(updated);
  assert.strictEqual(spread.left[0], updated[0]);
  assert.strictEqual(spread.left[1], updated[1]);
  assert.equal(items[0].comment, 'caption');
  assert.deepEqual(makeAlbumSpreads([]), []);
});

test('comment replacement removes empty buckets and preserves unrelated comments', () => {
  const original = { a: [{ id: 'first' }], b: [{ id: 'second' }] };
  const updated = replaceMediaComments(original, 'a', []);
  assert.deepEqual(updated, { b: original.b });
  assert.strictEqual(updated.b, original.b);
  assert.equal(original.a.length, 1);
});

test('annual event changes retain their original storage date and do not mutate other dates', () => {
  for (const date of ['09-25', '2020-09-25']) {
    const original = { [date]: [{ id: 'annual', date, showDday: true, yearly: true }], '2026-09-25': [{ id: 'once' }] };
    const updated = updateCalendarEvent(original, 'annual', event => ({ ...event, showDday: false }));
    assert.equal(updated[date][0].date, date);
    assert.equal(updated[date][0].showDday, false);
    assert.equal(original[date][0].showDday, true);
    assert.strictEqual(updated['2026-09-25'], original['2026-09-25']);
    assert.deepEqual(updateCalendarEvent(updated, 'annual', () => null), { '2026-09-25': original['2026-09-25'] });
    assert.strictEqual(updateCalendarEvent(original, 'missing', () => null), original);
  }
});

test('comment and event persistence report failure instead of pretending to save', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { localStorage: { setItem() { throw new Error('quota'); } } };
    assert.equal(saveMediaComments({}), false);
    assert.equal(saveCalendarEvents({}), false);
    globalThis.window.localStorage.setItem = () => {};
    assert.equal(saveMediaComments({}), true);
    assert.equal(saveCalendarEvents({}), true);
  } finally { globalThis.window = previous; }
});

test('export folder suggestions sanitize separators and retain readable names', () => {
  assert.equal(exportFolderName('  제주 / 가을: 사진..  '), '제주 가을 사진');
  assert.equal(exportFolderName('...'), '내보낸 사진');
  assert.equal(exportFolderName('가족 앨범'), '가족 앨범');
});
