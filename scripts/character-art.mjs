// Each species owns its silhouette and growth, rather than a recoloured base.
import { plantGrowthArtwork } from './plant-growth-art.mjs';
const ink = '#594940', green = '#789863';
const palettes = {
  potato: ['#e9bc77','#b38d5e'],
  'sweet-potato': ['#b888ab','#906081'], apple: ['#d9867b','#af645e'], orange: ['#efb16a','#ce894b'],
  ginkgo: ['#e8cb7c','#b4a05b'], camellia: ['#ce7e89','#9c5b66'], magnolia: ['#f1e5df','#ba9fa6'],
  'sea-lavender': ['#b1a0c7','#857393'], grape: ['#aa8bbd','#7f6495'], pear: ['#d6ce93','#a69d62'],
  rose: ['#dfa0b1','#b5748c'], jujube: ['#ac7966','#85584b'], chestnut: ['#ad8664','#7f634c'],
  barley: ['#dfc67f','#b2a061'], persimmon: ['#e5a36f','#bd784e'], peach: ['#edb4b7','#c88d95'],
};
const path = (d,fill,stroke=ink,width=2.4) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d,stroke=ink,width=2.4) => path(d,'none',stroke,width);
const ellipse = (x,y,rx,ry,fill,stroke='none',width=2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const circle = (x,y,r,fill,stroke='none',width=2) => ellipse(x,y,r,r,fill,stroke,width);
const leaf = (x,y,size=1,angle=0,fill=green) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size})">${path('M0 0Q-5-27 21-32Q25-8 0 0Z',fill,'#698357',1.8)}${line('M0 0 15-23','#698357',1.2)}</g>`;
const heartLeaf = (x,y,size=1,angle=0) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size})">${path('M0 0C-29-12-23-37-9-30C-3-28 0-22 0-22C7-40 30-32 24-14C19-5 7-2 0 0Z','#8ea978','#718961',1.8)}${line('M0 0 0-20','#718961',1.2)}</g>`;
const longLeaf = (x,y,size=1,angle=0) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size})">${path('M0 0Q-10-22 4-49Q22-15 0 0Z','#8aa370','#6c875b',1.8)}${line('M0 0 4-36','#6c875b',1)}</g>`;
const fan = (x,y,size,colour) => `<g transform="translate(${x} ${y}) scale(${size})">${path('M0 19C-28 12-54-6-46-30Q-37-39-28-29Q-24-43-14-32Q-7-49 0-36Q7-49 14-32Q24-43 28-29Q37-39 46-30C54-6 28 12 0 19Z',colour,'#91a063',2.2)}${[-35,-20,0,20,35].map(x=>line(`M0 17Q${x/2}-4 ${x}-27`,'#a0a465',1)).join('')}</g>`;
const petals = (x,y,n,rx,ry,distance,fill,stroke,offset=0) => `<g>${Array.from({length:n},(_,i)=>`<g transform="translate(${x} ${y}) rotate(${offset+i*360/n})">${ellipse(0,-distance,rx,ry,fill,stroke,1.6)}</g>`).join('')}</g>`;
const blossom = (x,y,size=1) => `<g transform="translate(${x} ${y}) scale(${size})">${petals(0,0,5,4,6,4,'#f5e6df','#cfaea6')}${circle(0,0,3,'#e1c67f')}</g>`;
const dots = (points,fill,r=1.4) => points.map(([x,y])=>circle(x,y,r,fill)).join('');

function artwork(type,s,colour,shade) {
  const r=[0,26,35,43,50][s];
  let art='',y=147,faceSize=.8+s*.05;
  switch(type) {
    case 'sweet-potato': {
      const top=125-s*10,left=83-s*4,right=135+s*4;
      art=path(`M${left} ${top}C${left+23} ${top-19} ${right} ${top-9} ${right} ${top+15}C${right+10} 151 139 187 116 193C92 197 ${left} 177 ${left-4} 157C${left-9} 137 ${left-8} ${top+11} ${left} ${top}Z`,colour,shade);
      art+=line(`M110 ${top}Q110 ${top-13} 117 ${top-21}`,green,3)+heartLeaf(115,top-9,.38+s*.12,-20);
      if(s>=2) art+=heartLeaf(108,top-5,.55,-65);
      if(s>=3) art+=line('M93 91Q58 90 60 127Q58 148 44 147Q33 138 47 132',green,2.8)+heartLeaf(62,117,.5,-85);
      if(s===4) art+=line('M122 88Q168 58 172 105Q173 131 188 130Q201 121 190 113',green,2.8)+heartLeaf(175,106,.55,40);
      art+=line(`M${left+8} ${top+12}Q${left+13} ${top+6} ${left+24} ${top+7}`,'#d9b2cf',4);
      break;
    }
    case 'apple': {
      const fill=['','#b9c78f','#c5c78a','#dba38b',colour][s],top=147-r*.8;
      art=path(`M110 ${top}C${110-r*.45} ${136-r} ${108-r} ${141-r*.8} ${108-r} 151C${108-r} ${155+r*.82} 94 ${156+r*.8} 110 ${152+r*.8}C130 ${159+r*.8} ${112+r} ${154+r*.7} ${112+r} 151C${112+r} ${141-r*.9} ${110+r*.35} ${136-r} 110 ${top}Z`,fill,shade);
      art+=line(`M110 ${top}Q105 ${top-10} 114 ${top-20}`,'#86694e',3.5)+leaf(113,top-10,.35+s*.12,15);
      if(s===2) art+=blossom(96,top-14,.8);
      if(s>=3) art+=ellipse(85,157,12,8,'#cf887c')+ellipse(137,157,12,8,'#cf887c');
      art+=line(`M${110-r*.55} ${143-r*.35}q-5 4-5 11`,'#f2d7bd',3.5);
      break;
    }
    case 'orange': {
      const fill=['','#b7c186','#d6cf87','#e6bc75',colour][s];
      art=ellipse(110,151,r+2,r*.88,fill,shade,2.5);
      art+=line(`M${110-r*.55} ${151-r*.6}q-10 ${r*.6} 0 ${r*1.2}`,'#c5a366',1.2)+line(`M${110+r*.55} ${151-r*.6}q10 ${r*.6} 0 ${r*1.2}`,'#c5a366',1.2);
      art+=leaf(109,151-r*.83,.35+s*.15,35);
      if(s>=3) art+=leaf(111,151-r*.82,.5,-65)+dots([[75,151],[83,173],[144,150],[135,174],[118,185]],shade);
      if(s===4) art+=circle(110,108,3,'#8b9e64');
      break;
    }
    case 'ginkgo': {
      y=117;faceSize=.65+s*.07;art=line('M110 141Q105 174 111 192','#9aa671',3);
      if(s===1) art+=path('M110 149C91 130 94 105 110 103C125 108 128 133 110 149Z','#b8c991','#91a063');
      else {if(s>=3) art+=fan(144,134,.48,s===4?'#dfc97c':'#aec587');art+=fan(110,121,.53+s*.14,s===4?colour:'#bfd08b');}
      if(s===4) art+=fan(77,177,.35,'#e4cc87');
      break;
    }
    case 'camellia': {
      y=119;faceSize=.68+s*.08;
      art=line('M110 143V191',green,4)+leaf(107,174,.55,-100)+leaf(110,177,.7,28);
      if(s===1) art+=path('M110 146C86 134 89 103 110 99C132 103 135 134 110 146Z',colour,shade)+path('M110 147 90 133 91 147 110 154 130 147 130 133Z','#7c9e69','#668959');
      else {art+=petals(110,116,s===2?3:s===3?5:8,16+s*2,24,17,colour,shade,s===2?0:18);if(s===4) art+=petals(110,116,6,13,17,9,'#dc98a1',shade,30);art+=circle(110,120,23,'#e6b2b2',shade,1.7);if(s===4) art+=dots([[95,105],[104,101],[114,101],[124,105]],'#d5af65',2);}
      break;
    }
    case 'magnolia': {
      y=s===1?118:132;faceSize=.65+s*.07;
      art=line('M112 155Q109 174 105 192','#9d8874',4)+leaf(108,176,.45,30);
      if(s===1) art+=path('M110 145C89 130 98 106 110 92C123 107 131 132 110 145Z','#dfccd0',shade);
      else {const spread=[0,0,17,34,55][s];for(const angle of s===2?[-20,0,20]:s===3?[-42,-20,0,20,42]:[-65,-40,-14,14,40,65]) art+=`<g transform="translate(110 147) rotate(${angle})">${path(`M0 0C${-14-spread*.08} -19 -13 -57 0 -72C16 -55 18 -18 0 0Z`,colour,shade,1.8)}</g>`;art+=path('M84 132Q110 151 137 132Q132 157 110 159Q89 155 84 132Z','#e9d4d9',shade,1.8);}
      break;
    }
    case 'sea-lavender': {
      y=118;faceSize=.7;art=line('M110 139Q116 167 110 193','#7b9674',3)+leaf(112,181,.65,38)+leaf(109,183,.6,-100);
      if(s===1) art+=ellipse(110,119,22,25,'#b6a5cb',shade);
      else {if(s>=3) art+=line('M111 175Q162 163 166 135','#7b9674',2.5)+(s===3?ellipse(166,130,9,12,colour,shade):petals(167,124,10,3.5,10,10,colour,shade)+circle(167,124,6,'#e1cc92'));art+=petals(110,117,s===2?7:s===3?11:16,s===2?7:5,s===2?20:28,s===2?15:21,colour,shade,12)+circle(110,118,22,'#e7d39b','#b4a779');}
      break;
    }
    case 'grape': {
      y=s===1?154:148;faceSize=.75;
      const positions=s===1?[]:s===2?[[88,132],[132,132]]:s===3?[[86,118],[134,118],[76,148],[145,147],[111,179]]:[[74,113],[100,104],[130,107],[150,125],[73,148],[146,156],[91,177],[127,180],[109,194]];
      const fill=s===1?'#b2c292':s===2?'#b6b5a0':colour;
      art=line('M109 112V88q19-14 27-1q0 12-11 7',green,2.8)+leaf(107,101,.55+s*.06,-48);
      art+=positions.map(([x,y])=>circle(x,y,s===4?17:19,fill,shade)).join('');art+=circle(110,y,26,fill,shade)+ellipse(98,y-13,5,3,'#e0d0e4');
      break;
    }
    case 'pear': {
      const neck=126-s*8,width=24+s*5,fill=s<3?'#b9cb90':colour;
      art=path(`M110 ${neck}C${110-width*.4} ${neck} 95 ${neck+17} 90 127C${110-width} 140 ${108-width} 178 90 186C106 195 132 192 143 179C${112+width} 161 130 131 126 125C119 ${neck+16} ${110+width*.4} ${neck} 110 ${neck}Z`,fill,shade);
      art+=line(`M110 ${neck}q-4-15 6-21`,'#8a7050',3.5)+longLeaf(114,neck-7,.45+s*.07,55);
      if(s>=3) art+=dots([[88,155],[94,172],[126,177],[139,159],[110,184],[133,140]],'#b69e67');
      break;
    }
    case 'rose': {
      y=119;faceSize=.63+s*.07;art=line('M110 151V191',green,3.5)+path('M108 173 78 160 84 169 76 174 86 178 85 185 108 173Z','#8a9e6f','#6d875b',1.5)+leaf(112,180,.5,36);
      if(s<=2) {art+=path(`M110 149C${82-s*2} 132 89 102 110 ${91-s*4}C132 103 ${139+s*2} 134 110 149Z`,colour,shade)+line('M95 112q27 4 18 27m-18-12q18 0 25-17',shade,1.8)+path('M110 156 92 143 91 129 105 144 110 149 119 142 130 129 127 146Z','#809664','#668959',1.7);}
      else {art+=petals(110,116,s===3?5:7,21,25,16,colour,shade,20)+petals(110,116,s===3?4:6,14,19,8,'#eab8c4',shade,55)+circle(110,121,21,'#e7b1bf',shade,1.5)+line('M94 102q13-10 28 0q-8 11-22 7q0-11 15-8',shade,1.6);}
      break;
    }
    case 'jujube': {
      const fill=s<=2?'#b8c58a':s===3?'#bb8d76':colour;
      art=line('M110 112q-4-17 8-27','#89735b',3)+longLeaf(115,103,.4+s*.11,47);
      if(s>=2) art+=longLeaf(107,102,.55,-50);
      if(s>=3) art+=line('M123 100q35 7 32 35','#89735b',2)+ellipse(152,148,13,21,fill,shade);
      if(s===4) art+=line('M105 108q-35 11-32 32','#89735b',2)+ellipse(75,157,12,21,fill,shade);
      art+=ellipse(110,150,23+s*2,30+s*3,fill,shade)+line('M93 132q-6 6-6 15','#d9bb9f',3.5);
      break;
    }
    case 'chestnut': {
      const spikes=Array.from({length:s===1?0:18},(_,i)=>{const a=i*Math.PI*2/18,x=110+48*Math.cos(a),y=148+42*Math.sin(a);return line(`M${x.toFixed(1)} ${y.toFixed(1)}l${(7*Math.cos(a)).toFixed(1)} ${(7*Math.sin(a)).toFixed(1)}`,'#91a36d',2);}).join('');
      art=leaf(110,106,.35+s*.1,-25);
      if(s<=2) art+=spikes+ellipse(110,151,s===1?26:46,s===1?30:40,'#b2c187','#91a36d');
      else {if(s===3) art+=spikes+path('M63 151Q68 105 110 105Q155 105 159 151L139 164 128 119 111 144 91 120 79 171Z','#b2c187','#91a36d');else art+=path('M49 173 39 163 44 155 56 158 61 148 75 159 88 153 89 180Q70 201 49 173Z','#afbe89','#8a9d67');art+=path(`M110 ${s===3?115:94}C95 123 ${s===3?78:62} 139 ${s===3?79:63} 168Q${s===3?83:73} 197 110 194Q${s===3?143:153} 194 ${s===3?142:158} 167C${s===3?143:160} 136 126 119 110 ${s===3?115:94}Z`,colour,shade)+path(`M${s===3?83:71} 179Q110 191 ${s===3?139:151} 178Q142 199 110 194Q83 197 ${s===3?83:71} 179Z`,'#dfc49b',shade,1.7);}
      break;
    }
    case 'barley': {
      y=145;faceSize=.68;const fill=s<=2?'#b7c389':colour;art=line('M110 161V193',green,3);
      const ear=(x,y,scale)=>`<g transform="translate(${x} ${y}) scale(${scale})">${line('M0 60V-50','#aa9f69',2)}${[-32,-12,8,28].map(h=>ellipse(-9,h,8,14,fill,shade,1.5)+ellipse(9,h,8,14,fill,shade,1.5)+line(`M-12 ${h-8}l-10-19m34 19 10-19`,shade,1)).join('')}</g>`;
      if(s===1) art+=ellipse(110,149,18,32,fill,shade)+line('M110 116q-2-21 8-30',green,2.5)+longLeaf(111,111,.38,-30);
      else {if(s>=3) art+=line('M110 194 70 133',green,2.5)+ear(70,122,.6);if(s===4) art+=line('M110 194 157 135',green,2.5)+ear(157,120,.62);art+=ear(110,122,.86)+ellipse(110,147,18,24,fill,shade,1.6);}
      break;
    }
    case 'persimmon': {
      const fill=s===1?'#aec389':s===2?'#d7c18b':s===3?'#e2b27b':colour,w=27+s*6,top=144-s*7;
      art=path(`M110 ${top}Q${110-w*.8} ${top-10} ${110-w} ${top+17}Q${103-w} 165 ${110-w*.72} 183Q110 197 ${110+w*.73} 183Q${117+w} 161 ${110+w} ${top+17}Q${110+w*.75} ${top-9} 110 ${top}Z`,fill,shade)+line(`M${110-w*.5} ${top+11}q-6 23 0 45m${w} -45q6 23 0 45`,shade,1.1);
      art+=`<g transform="translate(110 ${top}) scale(${.45+s*.15})">${path('M0 0Q-34-18-39-1Q-20 17 0 0Q-12 31 8 29Q23 17 0 0Q32 16 40-4Q22-18 0 0Q13-24-3-26Q-19-17 0 0Z','#829f6b','#668959',2)}</g>`;
      break;
    }
    case 'peach': {
      const w=23+s*7,top=142-s*6;
      art=path(`M110 ${top+6}C${103-w*.5} ${top-12} ${110-w} ${top-2} ${110-w} 151C${110-w} 176 97 184 110 194C123 184 ${110+w} 175 ${110+w} 151C${110+w} ${top-5} ${117+w*.5} ${top-13} 110 ${top+6}Z`,s===1?'#e8c9be':colour,shade)+line(`M110 ${top+8}q-9 12-3 24m2 30 1 19`,shade,1.5)+longLeaf(112,top+3,.4+s*.09,45);
      if(s>=3) art+=longLeaf(113,top+2,.55,-43)+ellipse(81,155,10,6,'#e59aa5')+ellipse(140,155,10,6,'#e59aa5');
      if(s===4) art+=dots([[74,143],[84,128],[143,132],[151,148]],'#e7c4c0',1.5);
      break;
    }
    default: throw new Error(`Missing character artwork: ${type}`);
  }
  return {art,y,faceSize};
}
function face(expression,mood,y,size) {
  const happy=expression==='happy'||expression==='grow',sad=expression==='sad';let eyes;
  if(sad) eyes=line('M-25-3q6 5 12 0m26 0q6 5 12 0',ink,2.5);
  else if(happy) eyes=line('M-25 0q6-9 12 0m26 0q6-9 12 0',ink,2.8);
  else if(mood==='melancholy') eyes=line('M-25-3q6 5 12 0m26 0q6 5 12 0',ink,2.5);
  else if(['cool','mysterious','proud'].includes(mood)) eyes=line('M-25-2h13m25 0h13',ink,2.5)+ellipse(-18,1,2.2,3.2,ink)+ellipse(19,1,2.2,3.2,ink);
  else if(mood==='shy') eyes=ellipse(-18,-1,3,4.8,ink)+ellipse(18,-1,3,4.8,ink)+circle(-19,-3,1.1,'#fff')+circle(17,-3,1.1,'#fff')+line('M-24-11q5-3 9 0m9 0q5-3 9 0',ink,1.7);
  else if(mood==='quirky') eyes=ellipse(-19,-1,3.3,4.6,ink)+ellipse(18,0,2.5,3.4,ink)+line('M-23-11l8-2',ink,1.7);
  else if(mood==='hyper') eyes=ellipse(-19,-1,3.4,5,ink)+ellipse(19,-1,3.4,5,ink)+circle(-20,-3,1,'#fff')+circle(18,-3,1,'#fff');
  else if(mood==='calm'||mood==='warm') eyes=line('M-25-1q6 4 12 0m26 0q6 4 12 0',ink,2.4);
  else eyes=ellipse(-19,-1,3.5,5,ink)+ellipse(19,-1,3.5,5,ink)+circle(-20,-3,1.1,'#fff')+circle(18,-3,1.1,'#fff');
  const mouth=sad?line('M-7 15q7-7 14 0',ink,2):happy?line('M-7 11q7 13 14 0',ink,2.2):mood==='cool'||mood==='mysterious'?line('M-6 12h12',ink,2):mood==='melancholy'?line('M-5 14q5-3 10 0',ink,1.8):line('M-7 11q7 8 14 0',ink,2.2);
  return `<g transform="translate(110 ${y}) scale(${size})"><g class="sproutEyes">${eyes}</g>${mouth}${ellipse(-29,11,6,2.8,'#e6a0a5')}${ellipse(29,11,6,2.8,'#e6a0a5')}${sad?path('M-27 6q-5 7 0 10q5-3 0-10Z','#b0c9d0','none'):''}</g>`;
}
export function renderCharacterSvg(definition,stage,expression='idle') {
  const [colour,shade]=palettes[definition.type];
  const {art,y,faceSize}=stage<6 ? plantGrowthArtwork(definition.type,stage,{path,line,ellipse,circle,leaf,heartLeaf,longLeaf,fan,blossom,petals}) : artwork(definition.type,4,colour,shade);
  const sparkle=expression==='grow'?path('M35 73l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z','#e5bd77','none')+circle(182,88,3,'#e5bd77'):'';
  const blink=expression==='idle'?'<style>.sproutEyes{transform-box:fill-box;transform-origin:center;animation:sproutBlink 5.2s infinite}@keyframes sproutBlink{0%,42%,46%,100%{transform:scaleY(1)}44%{transform:scaleY(.08)}}@media(prefers-reduced-motion:reduce){.sproutEyes{animation:none}}</style>':'';
  const frame=stage===1?'45 95 130 130':stage===2?'30 65 160 160':'0 0 220 220';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="${frame}" role="img" data-character="${definition.type}" data-stage="${stage}"><title>${definition.growthStages[stage-1].name}</title>${blink}${ellipse(110,199,stage===1?33:52,5,'#d9d2c1')}${art}${face(expression,definition.personality?.mood,y,faceSize)}${sparkle}</svg>`;
}
