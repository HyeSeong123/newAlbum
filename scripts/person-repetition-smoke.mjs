import assert from 'node:assert/strict';

// Production has no measurement menu. Exercise its bundled Workers directly,
// one live Worker at a time; development browser tests cover the shared clients
// and cancellation. A dog fixture must yield zero human faces, not an identity.
export async function verifyInstalledRepetitionMeasurement(page, mediaId, inputPath) {
  const snapshot = id => page.evaluate(async mediaId => ({
    faces: await window.__TAURI_INTERNALS__.invoke('list_face_index'),
    pet: await window.__TAURI_INTERNALS__.invoke('get_pet_scan', { mediaId }),
  }), id);
  const before = await snapshot(mediaId);
  const runs = await page.evaluate(async path => {
    const entry = document.querySelector('script[type="module"][src]');
    const bundle = await (await fetch(entry.src)).text();
    const names = ['person', 'pet'].map(domain => bundle.match(new RegExp(`${domain}\\.worker-[\\w-]+\\.js`))?.[0]);
    if (names.some(name => !name)) throw new Error('Production Workers missing');
    const bitmap = await createImageBitmap(await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(path, 'asset'))).blob());
    const inputs = [1600, 640].map(limit => {
      const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data };
    });
    bitmap.close();
    const rows = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let domain = 0; domain < 2; domain++) {
        const worker = new Worker(new URL(`/assets/${names[domain]}`, location.href), { type: 'module' });
        try {
          const input = inputs[domain], pixels = input.rgba.slice().buffer;
          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Worker repetition timed out')), 120000);
            worker.onmessage = event => { clearTimeout(timer); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
            worker.onerror = () => { clearTimeout(timer); reject(new Error('Worker repetition failed')); };
            worker.postMessage({ id: 1, width: input.width, height: input.height, pixels, backend: 'auto', viewHint: 'unknown', modelBase: new URL(domain ? '/models/pets/' : '/models/faces/', location.href).href }, [pixels]);
          });
          rows.push({ domain: domain ? 'pet' : 'person', count: (result.faces ?? result.features).length, diagnostics: result.diagnostics });
        } finally { worker.terminate(); }
      }
    }
    return rows;
  }, inputPath);
  assert.equal(runs.length, 40);
  assert.ok(runs.filter(row => row.domain === 'person').every(row => row.count === 0));
  assert.ok(runs.filter(row => row.domain === 'pet').every(row => row.count > 0));
  assert.ok(runs.every(row => row.diagnostics.backend === 'wasm'));
  for (const domain of ['person', 'pet']) {
    assert.equal(new Set(runs.filter(row => row.domain === domain).map(row => row.diagnostics.tensors)).size, 1);
  }
  assert.deepEqual(await snapshot(mediaId), before, 'Worker repetition must preserve stored people/pet links and features');
  await page.getByRole('tab', { name: '사람', exact: true }).click();
  await page.getByRole('button', { name: '얼굴 관리', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /인식 검증|기기 측정/ }).count(), 0);
  await page.screenshot({ path: 'test-results/android-smoke/people-simple-menu.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '반려동물', exact: true }).click();
  return { runs, cycles: 20, domainSwitches: 39, execution: 'bundled Workers directly; shared client cancellation covered in development browser tests', identityLinksPreserved: true, offline: true, identityAccuracyMeasured: false, phonePerformanceMeasured: false, wholeAppPeakMemoryMeasured: false };
}
