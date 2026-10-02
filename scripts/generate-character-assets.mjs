// Potato keeps the approved /brand/gamjassak-symbol.png at every stage.
// Original SVG illustrations: each growth stage and expression is a self-contained asset.
import { mkdirSync, writeFileSync } from 'node:fs';
const palettes = {
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
function coreBody(type, stage, p) {
  const grow = stage - 1;
  if (type === 'sweet-potato') return `<path d="M73 ${91-grow*4} C91 ${77-grow*4},139 ${80-grow*3},151 ${104-grow*3} C163 127,153 174,127 191 C105 205,77 187,69 160 C61 134,56 105,73 ${91-grow*4}Z" fill="${p.body}" stroke="${p.shade}" stroke-width="3"/><path d="M78 106 C91 95,106 92,118 94" fill="none" stroke="${p.highlight}" stroke-width="7" opacity=".18" stroke-linecap="round"/>`;
  if (type === 'apple') {
    const body = stage === 1 ? '#b9c987' : stage === 2 ? '#c9bc82' : stage === 3 ? '#db9e83' : p.body;
    return `<path d="M110 108 C91 94,54 102,47 135 C40 169,65 193,105 191 C145 198,177 174,173 138 C170 104,134 94,110 108Z" fill="${body}" stroke="${p.shade}" stroke-width="3"/><path d="M110 108 C107 99,108 91,113 82" fill="none" stroke="#795c43" stroke-width="5" stroke-linecap="round"/><path d="M115 88 C129 73,146 78,151 88 C135 94,124 95,115 88Z" fill="${p.leaf}" stroke="#668756" stroke-width="2"/>`;
  }
  if (type === 'orange') {
    const body = stage === 1 ? '#d9cf7a' : stage === 2 ? '#e2c875' : stage === 3 ? '#e9ba70' : p.body;
    return `<circle cx="110" cy="148" r="${45+grow*3}" fill="${body}" stroke="${p.shade}" stroke-width="3"/><g fill="${p.shade}" opacity=".25"><circle cx="82" cy="137" r="1.6"/><circle cx="141" cy="155" r="1.5"/><circle cx="101" cy="177" r="1.4"/><circle cx="133" cy="125" r="1.3"/></g><path d="M108 104 C119 82,146 82,157 98 C139 109,123 110,108 104Z" fill="${p.leaf}" stroke="#668756" stroke-width="2.5"/>`;
  }
  return '';
}
function coreLeaves(type, stage, p) {
  if (stage === 1) return '';
  if (type === 'sweet-potato') return `<path d="M103 94 C89 73,79 55,88 39 C102 50,107 65,108 81 C120 59,137 48,151 51 C148 70,130 87,108 98Z" fill="${p.leaf}" stroke="#668756" stroke-width="3"/>${stage>2?'<path d="M92 73 C72 68,62 55,60 43 C76 44,89 53,99 66" fill="none" stroke="#668756" stroke-width="4" stroke-linecap="round"/>':''}`;
  return '';
}
function coreFace(type, expression) {
  const happy = expression === 'happy' || expression === 'grow';
  if (type === 'sweet-potato') return `${happy?'<path d="M80 140q8-9 16 0m29 0q8-9 16 0" fill="none" stroke="#574941" stroke-width="3.2" stroke-linecap="round"/>':'<path d="M80 140q8 4 16 0m29 0q8 4 16 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>'}<ellipse cx="74" cy="154" rx="7" ry="3.5" fill="#ef9caa" opacity=".55"/><ellipse cx="147" cy="154" rx="7" ry="3.5" fill="#ef9caa" opacity=".55"/>`;
  if (type === 'apple') return `${happy?'<path d="M76 143q8-10 16 0m36 0q8-10 16 0" fill="none" stroke="#574941" stroke-width="3.4" stroke-linecap="round"/>':'<ellipse cx="84" cy="140" rx="4" ry="5.5" fill="#574941"/><ellipse cx="136" cy="140" rx="4" ry="5.5" fill="#574941"/><circle cx="82.5" cy="138.5" r="1.2" fill="white"/><circle cx="134.5" cy="138.5" r="1.2" fill="white"/>'}`;
  if (type === 'orange') return `${happy?'<path d="M78 144q8-11 16 0m32 0q8-11 16 0" fill="none" stroke="#574941" stroke-width="3.5" stroke-linecap="round"/>':'<ellipse cx="86" cy="141" rx="3.5" ry="4.5" fill="#574941"/><ellipse cx="134" cy="141" rx="3.5" ry="4.5" fill="#574941"/>'}<g fill="#a96e4d" opacity=".5"><circle cx="71" cy="151" r="1.3"/><circle cx="75" cy="155" r="1.1"/><circle cx="149" cy="151" r="1.3"/><circle cx="145" cy="155" r="1.1"/></g>`;
  return '';
}
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
    const isCore = ['sweet-potato','apple','orange'].includes(type);
    const body = isCore ? coreBody(type, stage, p) : `<path d="M${110-size} 145 C${110-size} ${top-21},${110-size*.6} ${top-38},110 ${top-31} C${110+size*.6} ${top-38},${110+size} ${top-21},${110+size} 145 C${110+size} 188,${110+size*.6} 194,110 193 C${110-size*.6} 194,${110-size} 188,${110-size} 145Z" fill="${p.body}" stroke="${p.shade}" stroke-width="3"/><ellipse cx="${110-size*.4}" cy="124" rx="${size*.23}" ry="${size*.36}" fill="${p.highlight}" opacity=".38"/>`;
    const face = isCore ? coreFace(type, expression) : `${eyes}<ellipse cx="70" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/><ellipse cx="150" cy="151" rx="7" ry="3" fill="#e78c87" opacity=".58"/>`;
    const sprout = isCore ? coreLeaves(type, stage, p) : leaves;
    const coreMouth = isCore && expression === 'sad' ? '<path d="M101 161q9-9 18 0" fill="none" stroke="#574941" stroke-width="3" stroke-linecap="round"/>' : mouth;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220" role="img"><ellipse cx="110" cy="${isCore?198:196}" rx="${type==='orange'?45:55}" ry="${isCore?8:9}" fill="#d8d2bd" opacity=".42"/>${sprout}${isCore?'':ornament}${body}${face}${coreMouth}${sparkles}</svg>`;
    writeFileSync(`public/characters/${type}/stage${stage}-${expression}.svg`,svg);
  }
}
