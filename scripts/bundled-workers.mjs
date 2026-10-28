// Used only by installed-APK checks. Follow the packaged JS graph without
// importing UI modules, initializing models, or adding a test API to the app.
export async function findBundledWorkers({ domains, entryUrl }) {
  const entry = entryUrl || document.querySelector('script[type="module"][src]')?.src;
  if (!entry) throw new Error('Production entry was not found');
  if (!domains.length || domains.some(domain => !['person', 'pet'].includes(domain))) throw new Error('Unknown production Worker');
  const origin = new URL(entry).origin, queue = [entry], seen = new Set(), found = {};
  while (queue.length && seen.size < 32) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Production bundle unavailable: ${new URL(url).pathname}`);
    const bundle = await response.text();
    for (const domain of domains) {
      const name = bundle.match(new RegExp(`${domain}\\.worker-[\\w-]+\\.js`))?.[0];
      if (name) found[domain] = name;
    }
    if (domains.every(domain => found[domain])) return found;
    for (const match of bundle.matchAll(/["'`]([^"'`\s]+\.js)["'`]/g)) {
      const reference = match[1];
      const child = new URL(reference.startsWith('assets/') ? `/${reference}` : reference, url);
      if (child.origin !== origin || !child.pathname.startsWith('/assets/') || /\.worker-/.test(child.pathname)) continue;
      if (!seen.has(child.href) && !queue.includes(child.href)) queue.push(child.href);
    }
  }
  throw new Error(`Production ${domains.filter(domain => !found[domain]).join(', ')} Worker missing`);
}
