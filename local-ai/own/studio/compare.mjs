import { readFile } from 'node:fs/promises';
import { stdin } from 'node:process';
import { modelUrl } from '../../../scripts/ts-module-loader.mjs';
import { ownReplyMode } from '../../../scripts/own-reply-policy.mjs';

const { loadOwnModel, generateOwnLine } = await import(await modelUrl(
  new URL('../../../src/features/characters/ownAi/engine.ts', import.meta.url),
));
let text = '';
for await (const chunk of stdin.setEncoding('utf8')) text += chunk;
const input = JSON.parse(text);
const [standard, candidate] = process.argv.slice(2);

async function response(file) {
  if (ownReplyMode(input) === 'nonverbal') return { status: 'nonverbal' };
  try {
    const model = loadOwnModel(JSON.parse(await readFile(file, 'utf8')));
    return { status: 'ok', line: generateOwnLine(model, input, 20261115) };
  } catch (error) {
    return { status: 'error', code: error.message };
  }
}

console.log(JSON.stringify({
  standard: await response(standard),
  candidate: candidate ? await response(candidate) : null,
}));
