// Original SVG illustrations: each growth stage and expression is a self-contained asset.
import { mkdirSync, writeFileSync } from 'node:fs';
const palettes = {
  potato: { body:'#d8ad78', shade:'#b98456', leaf:'#76a46a', highlight:'#f6d5a7' },
  'sweet-potato': { body:'#b783aa', shade:'#925d85', leaf:'#83a86d', highlight:'#dcb8d1' },
  apple: { body:'#e6a096', shade:'#c87068', leaf:'#779f63', highlight:'#f5beb5' },
  orange: { body:'#efb46e', shade:'#d89455', leaf:'#76a96c', highlight:'#f7c991' },
  ginkgo: { body:'#e5c77a', shade:'#b79c53', leaf:'#98a65a', highlight:'#f5e4a6', accent:'#e3b950', ornament:'fan' },
  camellia: { body:'#d88b91', shade:'#a95a63', leaf:'#64996f', highlight:'#f2b6b7', accent:'#b9404f', ornament:'flower' },
  magnolia: { body:'#e7c2d0', shade:'#b98eab', leaf:'#78a575', highlight:'#f8dce4', accent:'#f4e9dd', ornament:'flower' },
  'sea-lavender': { body:'#aaa1c5', shade:'#817798', leaf:'#7ba18a', highlight:'#d2c9e1', accent:'#817abc', ornament:'flower' },
  grape: { body:'#a483b6', shade:'#755689', leaf:'#7d9f65', highlight:'#d9badf', accent:'#714a91', ornament:'fruit' },
  pear: { body:'#cdd898', shade:'#9aa866', leaf:'#789e6a', highlight:'#ebf0c7', accent:'#e7dda0', ornament:'fruit' },
  rose: { body:'#dc9da9', shade:'#aa6778', leaf:'#709763', highlight:'#f3c7d0', accent:'#cc5d78', ornament:'flower' },
  jujube: { body:'#ba8e74', shade:'#90634e', leaf:'#7d9a63', highlight:'#dfbba6', accent:'#b74f4f', ornament:'fruit' },
  chestnut: { body:'#b5987a', shade:'#866b52', leaf:'#829f69', highlight:'#dcc4a4', accent:'#936442', ornament:'fruit' },
  barley: { body:'#dfc681', shade:'#aa9457', leaf:'#87a86a', highlight:'#f3e2a7', accent:'#e1b85f', ornament:'grain' },
  persimmon: { body:'#efa472', shade:'#c27850', leaf:'#82a36d', highlight:'#f6c69e', accent:'#e37c42', ornament:'fruit' },
  peach: { body:'#f0b3ae', shade:'#c98884', leaf:'#87aa6d', highlight:'#f8d2c8', accent:'#e89189', ornament:'fruit' },
};
for (const [type,p] of Object.entries(palettes)) {
  mkdirSync(`public/characters/${type}`, { recursive: true });
  for (let stage=1; stage<=4; stage++) for (const expression of ['idle','happy','sad','grow']) {
    const size = [0,38,53,67,78][stage];
    const top = 141-size/2;
    const leaves = stage === 1 ? '' : `<path d="M110 88 C${80-stage*3} ${86-stage*10},${76-stage*3} ${55-stage*5},110 68 C${142+stage*3} ${40-stage*5},${148+stage*3} ${75-stage*5},110 88Z" fill="${p.leaf}" stroke="#668756" stroke-width="3"/><path d="M110 86V${58-stage*3}" stroke="#668756" stroke-width="3" stroke-linecap="round"/>`;
    const ornament = stage === 1 ? '' : p.ornament === 'flower'
      ? `<g fill="${p.accent}" stroke="${p.shade}" stroke-width="1.2">${Array.from({length:5},(_,i)=>`<circle cx="${(110+8*Math.cos(i*2*Math.PI/5)).toFixed(1)}" cy="${(44+8*Math.sin(i*2*Math.PI/5)).toFixed(1)}" r="5.5"/>`).join('')}<circle cx="110" cy="44" r="4" fill="${p.highlight}"/></g>`
      : p.ornament === 'fruit' ? `<circle cx="110" cy="43" r="9" fill="${p.accent}" stroke="${p.shade}" stroke-width="2"/><ellipse cx="107" cy="39" rx="2.5" ry="3.5" fill="${p.highlight}" opacity=".7"/>`
      : p.ornament === 'grain' ? `<g fill="${p.accent}" stroke="${p.shade}" stroke-width="1"><path d="M110 61V25" fill="none" stroke-width="2"/>${[29,38,47].map(y=>`<ellipse cx="104" cy="${y}" rx="4" ry="7" transform="rotate(-35 104 ${y})"/><ellipse cx="116" cy="${y}" rx="4" ry="7" transform="rotate(35 116 ${y})"/>`).join('')}</g>`
      : p.ornament === 'fan' ? `<path d="M110 54Q88 47 94 32Q100 39 104 29Q108 36 110 25Q115 36 119 29Q121 40 127 32Q133 47 110 54Z" fill="${p.accent}" stroke="${p.shade}" stroke-width="2"/>` : '';
    const eyes = expression === 'happy' || expression === 'grow'
      ? '<path d="M77 137q8-11 16 0m34 0q8-11 16 0" fill="none" stroke="#574941" stroke-width="3.5" stroke-linecap="round"/>'
      : '<ellipse cx="85" cy="137" rx="3" ry="4" fill="#574941"/><ellipse cx="135" cy="137" rx="3" ry="4" fill="#574941"/>';
    const mouth = expression === 'sad' ? '<path d="M101 159q9-10 18 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>' : '<path d="M101 153q9 12 18 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>';
    const sparkles = expression === 'grow' ? `<path d="M33 73l4 10 10 4-10 4-4 10-4-10-10-4 10-4zm151-12l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#e4b76a"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" role="img"><ellipse cx="110" cy="196" rx="55" ry="9" fill="#d8d2bd" opacity=".42"/>${leaves}${ornament}<path d="M${110-size} 145 C${110-size} ${top-21},${110-size*.6} ${top-38},110 ${top-31} C${110+size*.6} ${top-38},${110+size} ${top-21},${110+size} 145 C${110+size} 188,${110+size*.6} 194,110 193 C${110-size*.6} 194,${110-size} 188,${110-size} 145Z" fill="${p.body}" stroke="${p.shade}" stroke-width="3"/><ellipse cx="${110-size*.4}" cy="124" rx="${size*.23}" ry="${size*.36}" fill="${p.highlight}" opacity=".38"/>${eyes}<ellipse cx="70" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/><ellipse cx="150" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/>${mouth}${sparkles}</svg>`;
    writeFileSync(`public/characters/${type}/stage${stage}-${expression}.svg`,svg);
  }
}
