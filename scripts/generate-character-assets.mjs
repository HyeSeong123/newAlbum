// Original SVG illustrations: each growth stage and expression is a self-contained asset.
import { mkdirSync, writeFileSync } from 'node:fs';
const palettes = {
  potato: { body:'#d8ad78', shade:'#b98456', leaf:'#76a46a', highlight:'#f6d5a7' },
  'sweet-potato': { body:'#b783aa', shade:'#925d85', leaf:'#83a86d', highlight:'#dcb8d1' },
  apple: { body:'#e6a096', shade:'#c87068', leaf:'#779f63', highlight:'#f5beb5' },
  orange: { body:'#efb46e', shade:'#d89455', leaf:'#76a96c', highlight:'#f7c991' },
};
for (const [type,p] of Object.entries(palettes)) {
  mkdirSync(`public/characters/${type}`, { recursive: true });
  for (let stage=1; stage<=4; stage++) for (const expression of ['idle','happy','sad','grow']) {
    const size = [0,38,53,67,78][stage];
    const top = 141-size/2;
    const leaves = stage === 1 ? '' : `<path d="M110 88 C${80-stage*3} ${86-stage*10},${76-stage*3} ${55-stage*5},110 68 C${142+stage*3} ${40-stage*5},${148+stage*3} ${75-stage*5},110 88Z" fill="${p.leaf}" stroke="#668756" stroke-width="3"/><path d="M110 86V${58-stage*3}" stroke="#668756" stroke-width="3" stroke-linecap="round"/>`;
    const eyes = expression === 'happy' || expression === 'grow'
      ? '<path d="M77 137q8-11 16 0m34 0q8-11 16 0" fill="none" stroke="#574941" stroke-width="3.5" stroke-linecap="round"/>'
      : '<ellipse cx="85" cy="137" rx="3" ry="4" fill="#574941"/><ellipse cx="135" cy="137" rx="3" ry="4" fill="#574941"/>';
    const mouth = expression === 'sad' ? '<path d="M101 159q9-10 18 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>' : '<path d="M101 153q9 12 18 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>';
    const sparkles = expression === 'grow' ? `<path d="M33 73l4 10 10 4-10 4-4 10-4-10-10-4 10-4zm151-12l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#e4b76a"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" role="img"><ellipse cx="110" cy="196" rx="55" ry="9" fill="#d8d2bd" opacity=".42"/>${leaves}<path d="M${110-size} 145 C${110-size} ${top-21},${110-size*.6} ${top-38},110 ${top-31} C${110+size*.6} ${top-38},${110+size} ${top-21},${110+size} 145 C${110+size} 188,${110+size*.6} 194,110 193 C${110-size*.6} 194,${110-size} 188,${110-size} 145Z" fill="${p.body}" stroke="${p.shade}" stroke-width="3"/><ellipse cx="${110-size*.4}" cy="124" rx="${size*.23}" ry="${size*.36}" fill="${p.highlight}" opacity=".38"/>${eyes}<ellipse cx="70" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/><ellipse cx="150" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/>${mouth}${sparkles}</svg>`;
    writeFileSync(`public/characters/${type}/stage${stage}-${expression}.svg`,svg);
  }
}
