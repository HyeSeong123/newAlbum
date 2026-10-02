import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Legal-dong code archive published by the Ministry of the Interior and Safety.
const source = 'https://mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00146280tlU2Y2B&fileSn=0';
const archive = join(tmpdir(), `oraedameun-jscode-${process.pid}.zip`);
const output = new URL('../src/features/map/koreanDistricts.ts', import.meta.url);
const regionCodes = new Map([
  ['서울특별시', 'KR-11'], ['부산광역시', 'KR-26'], ['대구광역시', 'KR-27'],
  ['인천광역시', 'KR-28'], ['대전광역시', 'KR-30'], ['울산광역시', 'KR-31'],
  ['경기도', 'KR-41'], ['강원특별자치도', 'KR-42'], ['충청북도', 'KR-43'],
  ['충청남도', 'KR-44'], ['전북특별자치도', 'KR-45'],
  ['전남광주통합특별시', 'KR-46'], ['경상북도', 'KR-47'],
  ['경상남도', 'KR-48'], ['제주특별자치도', 'KR-49'],
  ['세종특별자치시', 'KR-50'],
]);

const response = await fetch(source);
if (!response.ok) throw new Error(`Code download failed: ${response.status}`);
writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

try {
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/);
  const entry = entries.find(name => /\/KIKcd_B\.\d+$/.test(name));
  if (!entry) throw new Error('Legal-dong code file not found in archive');
  const rows = new TextDecoder('euc-kr').decode(execFileSync('tar', ['-xOf', archive, entry], { maxBuffer: 20 * 1024 * 1024 }));
  const districts = new Map([...regionCodes.values()].map(code => [code, []]));

  for (const line of rows.split(/\r?\n/)) {
    const match = /^(\d{5}00000)\s+(\S+)\s+(.+?)\s{2,}/.exec(line);
    if (!match || /^\d{2}00000000$/.test(match[1])) continue;
    const code = regionCodes.get(match[2]);
    const name = match[3].trim();
    if (code && /^[가-힣]/.test(name) && !name.includes('출장') && !districts.get(code).includes(name)) districts.get(code).push(name);
  }

  if ([...districts.values()].reduce((sum, names) => sum + names.length, 0) < 250) {
    throw new Error('District list is unexpectedly short');
  }
  const lines = [
    '// Generated from the MOIS legal-dong code archive (2026-07-01).',
    `// ${source}`,
    'export const KOREAN_DISTRICTS: Record<string, readonly string[]> = {',
    ...[...districts].map(([code, names]) => `  ${JSON.stringify(code)}: ${JSON.stringify(names)},`),
    '};',
    '',
  ];
  writeFileSync(output, lines.join('\n'), 'utf8');
  console.log(`Updated ${output.pathname} with ${[...districts.values()].reduce((sum, names) => sum + names.length, 0)} districts`);
} finally {
  unlinkSync(archive);
}
