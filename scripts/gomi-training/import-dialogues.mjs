import { readFile } from 'node:fs/promises';

export function parseUserDialogues(text, { sectionCount = 6, quotesPerSection = 40, idPrefix = 'user240',
  coreLabel = '성격 핵심', rulesHeading = '## AI 학습 시 유지할 고미의 성격 규칙' } = {}) {
  const sections = [], examples = [];
  let current;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      const heading = line.match(/^## (\d+)\.\s+(.+?)\s+[—–-]\s+(\d+)개$/u);
      current = heading && Number(heading[1]) <= sectionCount && Number(heading[3]) === quotesPerSection
        ? { number: Number(heading[1]), title: heading[2], core: '' } : undefined;
      if (current) sections.push(current);
      continue;
    }
    if (!current) continue;
    const coreStart = `**${coreLabel}:**`;
    if (line.startsWith(coreStart)) { current.core = line.slice(coreStart.length).trim(); continue; }
    if (!/^\d+\./u.test(line)) continue;
    const match = line.match(/^(\d+)\.\s+\[([^\]]+)\]\s+"(.*)"$/u);
    if (!match) throw new Error(`Malformed dialogue: section ${current.number}: ${line}`);
    const number = Number(match[1]);
    examples.push({ id: `${idPrefix}-${current.number}-${String(number).padStart(2, '0')}`,
      section: current.number, number, situation: match[2], speech: match[3] });
  }
  if (sections.length !== sectionCount || new Set(sections.map(row => row.number)).size !== sectionCount
      || sections.some(row => row.number < 1 || row.number > sectionCount)) throw new Error(`incomplete ${sectionCount} sections`);
  for (const section of sections) {
    const numbers = examples.filter(row => row.section === section.number).map(row => row.number).sort((a,b) => a-b);
    if (!section.core || numbers.length !== quotesPerSection || numbers.some((number, index) => number !== index + 1)) {
      throw new Error(`incomplete section ${section.number}: expected ${quotesPerSection} numbered quotes`);
    }
  }
  const rulesAt = text.indexOf(rulesHeading);
  if (rulesAt < 0) throw new Error('missing user personality rules');
  return { sections, examples, rules: text.slice(rulesAt).trim() };
}

export function scenePrompt(situation, core) {
  const system = [
    '너는 암컷 푸들 고미다. 도도하고 시크하고 고집이 세며 집사에게 애착이 강하다.',
    '고미는 자기 뜻을 재촉하고 집사에게 편의를 요구한다. 친해져도 자기 주장과 투정은 유지한다.',
    core,
    '너 자신이 고미이고 집사는 보호자다. 집사가 고미를 돌보는 장면에서 역할을 뒤집지 않는다.',
    '사용자가 가정한 장면에 답한다. 실제로 관찰했다고 꾸미거나 사진·GPS·일기 내용을 안다고 하지 않는다.',
    '고미가 직접 하는 자연스러운 반말 1~2문장, 70자 이내만 말한다. 존댓말·괄호 지문·성격 설명·이모지는 쓰지 않는다.',
  ].join('\n');
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${situation} 이 장면에서 고미가 하는 한마디는?<|im_end|>\n<|im_start|>assistant\n`;
}

export async function loadUserDialogues() {
  const bytes = await readFile(new URL('./user-dialogues-240.txt', import.meta.url));
  return { ...parseUserDialogues(bytes.toString('utf8')), bytes };
}
