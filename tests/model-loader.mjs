import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const cache = new Map();
export async function modelUrl(relative) {
  const url = relative instanceof URL ? relative : new URL(`../src/${relative}`, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const source = await readFile(url, 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const imports = [...outputText.matchAll(/from\s+["'](\.[^"']+)["']/g)];
  for (const match of imports) {
    const child = await modelUrl(new URL(`${match[1]}.ts`, url));
    outputText = outputText.replace(match[0], `from '${child}'`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  cache.set(url.href, result); return result;
}
