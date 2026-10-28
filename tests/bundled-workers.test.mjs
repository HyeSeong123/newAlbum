import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

async function withBundles(files, run) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(Object.hasOwn(files, request.url) ? 200 : 404, { 'content-type': 'text/javascript' });
    response.end(files[request.url] ?? 'missing');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/assets/index.js`, requests); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('installed worker discovery follows lazy UI chunks without fetching workers or unrelated URLs', async () => {
  const { findBundledWorkers } = await import('../scripts/bundled-workers.mjs');
  await withBundles({
    '/assets/index.js': 'new URL("/assets/pet.worker-Pet_12.js",import.meta.url); import("./PeopleWorkspace-UI12.js"); const preload=["assets/PeopleWorkspace-UI12.js","assets/unused.js","assets/style.css","https://outside.invalid/assets/no.js","../../private.js"];',
    '/assets/PeopleWorkspace-UI12.js': 'import "./index.js"; new URL("/assets/person.worker-Face_34.js",import.meta.url);',
  }, async (entryUrl, requests) => {
    assert.deepEqual(await findBundledWorkers({ entryUrl, domains: ['person', 'pet'] }), { pet: 'pet.worker-Pet_12.js', person: 'person.worker-Face_34.js' });
    assert.deepEqual(requests, ['/assets/index.js', '/assets/PeopleWorkspace-UI12.js']);
  });
});

test('missing production workers fail after visiting a cyclic chunk graph once', async () => {
  const { findBundledWorkers } = await import('../scripts/bundled-workers.mjs');
  await withBundles({
    '/assets/index.js': 'import "./shared.js";',
    '/assets/shared.js': 'import "./index.js";',
  }, async (entryUrl, requests) => {
    await assert.rejects(findBundledWorkers({ entryUrl, domains: ['person'] }), /Production person Worker missing/);
    assert.deepEqual(requests, ['/assets/index.js', '/assets/shared.js']);
  });
});

test('a missing referenced production chunk is reported instead of skipping inference', async () => {
  const { findBundledWorkers } = await import('../scripts/bundled-workers.mjs');
  await withBundles({ '/assets/index.js': 'import "./missing.js";' }, async entryUrl => {
    await assert.rejects(findBundledWorkers({ entryUrl, domains: ['person'] }), /Production bundle unavailable/);
  });
});
