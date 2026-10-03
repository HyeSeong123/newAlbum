// Seed, germination, seedling, vegetative growth and first reproductive growth.
// Species share drawing primitives, but retain their actual root/leaf/branch forms.
export function plantGrowthArtwork(type, stage, h) {
  const { path,line,ellipse,circle,leaf,heartLeaf,longLeaf,fan,blossom,petals } = h;
  const brown='#a78862',green='#8da96c',dark='#5f865e';
  const seedColours={potato:'#e9bc77','sweet-potato':'#c296ae',apple:'#967759',orange:'#dfc998',ginkgo:'#d9cc9b',camellia:'#9b7b61',magnolia:'#c98d7a','sea-lavender':'#dbcd9e',grape:'#a58b67',pear:'#a28a65',rose:'#be9b78',jujube:'#b7976e',chestnut:'#a77b56',barley:'#dbbd78',persimmon:'#a98868',peach:'#b78d67'};
  const fill=seedColours[type];
  let art='',y=157,faceSize=.7;
  const soil=ellipse(110,184,58,9,'#e8dfcf')+line('M61 184q19-5 34 0m27 0q22-5 36 0','#d1c0a7',1.3);
  const roots=(more=false)=>`<g data-part="roots">${line('M110 173q-1 12 5 23m-5-13-11 7m12-5 10 6','#c3a57b',1.8)}${more?line('M99 169q-8 13-21 20m8-8-2 11m35-22q10 14 26 19m-9-8 2 10','#c3a57b',1.5):''}</g>`;
  function seed() {
    if(type==='potato') return path('M77 148Q77 132 99 132Q114 124 137 139Q150 155 141 171Q131 184 105 180Q77 183 73 165Z',fill,brown)+circle(83,151,2.5,brown)+circle(136,164,2,brown)+circle(100,135,2,brown);
    if(type==='sweet-potato') return path('M73 148Q84 131 110 135Q140 132 148 145Q143 172 119 179Q88 179 73 164Q67 156 73 148Z',fill,'#a87f98')+line('M78 149q11-9 20-7','#dfb6c7',3);
    if(type==='chestnut') return path('M110 126Q91 137 79 152Q74 177 111 183Q146 177 141 152Q128 135 110 126Z',fill,'#856448')+path('M82 170Q111 179 139 170Q134 183 110 183Q88 183 82 170Z','#e0c29d','#856448',1.3);
    if(type==='peach') return path('M110 126Q86 128 83 153Q84 178 110 185Q136 177 137 153Q133 128 110 126Z',fill,brown)+line('M94 138q-8 13 0 28m32-30q8 14-2 28m-22-37q-5 13-3 17m12 16q4 9 0 16','#8f6b49',1.2);
    if(type==='barley') return ellipse(110,155,20,34,fill,'#b69a5f')+line('M109 128q-6 28 0 52','#ba995c',1.6);
    if(type==='jujube'||type==='persimmon') return path('M110 127Q87 144 91 169Q110 188 129 169Q135 145 110 127Z',fill,brown)+line('M108 130q-7 15-4 21m7 17 1 10','#8c7051',1.4);
    if(type==='apple'||type==='pear'||type==='grape') return path('M110 127Q90 137 88 158Q87 177 110 182Q133 174 132 157Q131 139 110 127Z',fill,'#806b50')+line('M96 142q-5 7-5 15','#d4b994',2.5);
    if(type==='magnolia') return ellipse(110,155,26,30,fill,'#ab7566')+line('M98 135q-9 7-7 15','#e7b69f',3);
    if(type==='sea-lavender') return ellipse(110,158,21,27,fill,brown)+[[-9,-12],[0,-17],[10,-12]].map(([x,v])=>line(`M110 135l${x} ${v}`,'#c9b997',1)).join('');
    return ellipse(110,156,type==='ginkgo'?29:25,type==='orange'?29:27,fill,brown)+line('M96 140q-7 8-5 15','#ecdbc0',3);
  }
  const foliage=(x,v,size=1,angle=0)=> {
    if(type==='sweet-potato') return heartLeaf(x,v,size,angle);
    if(type==='ginkgo') return `<g transform="translate(${x} ${v}) rotate(${angle})">${fan(0,-9,size*.6,'#a7c482')}</g>`;
    if(type==='peach') return longLeaf(x,v,size,angle);
    if(type==='grape') return `<g transform="translate(${x} ${v}) rotate(${angle}) scale(${size})">${path('M0 0Q-15-5-19-17L-8-16-12-29 1-24 10-38 17-26 31-30 24-18 35-13Q18 0 0 0Z',green,dark,1.5)}${line('M0 0 12-24',dark,1)}</g>`;
    if(type==='chestnut'||type==='rose') return `<g transform="translate(${x} ${v}) rotate(${angle}) scale(${size})">${path('M0 0-8-7-5-13-9-20-3-25-5-32 4-39 12-31 12-23 18-17 13-11 13-4Z',type==='rose'?'#82a16b':green,dark,1.5)}${line('M0 0 4-30',dark,1)}</g>`;
    if(type==='camellia') return leaf(x,v,size,angle,'#72976e');
    if(type==='persimmon') return `<g transform="translate(${x} ${v}) rotate(${angle}) scale(${size*1.12})">${leaf(0,0,1,0,green)}</g>`;
    if(type==='jujube') return leaf(x,v,size*.85,angle)+`<g transform="translate(${x} ${v}) rotate(${angle}) scale(${size*.85})">${line('M2-3q6-16 17-25m-15 22q-1-13 10-24',dark,1)}</g>`;
    return leaf(x,v,size,angle,green);
  };
  if(stage===1) return { art:soil+seed(),y,faceSize };
  if(stage===2) {
    const shoot=type==='potato'?'#af9bb0':green;
    art=soil+roots()+seed()+line('M113 136q-14-13-5-29',shoot,4)+line('M110 116q-9-5-14 2',shoot,3);
    if(type==='barley') art+=path('M111 129Q102 111 117 95Q122 110 111 129Z','#a9bd86',dark,1.6);
    else art+=foliage(108,110,.28,15);
    art+=line('M125 129l-6 11 7 8','#eee1ce',1.8);
    return {art,y,faceSize};
  }
  if(type==='potato'||type==='sweet-potato') {
    art=soil+roots(stage>=4)+seed()+line(`M110 137Q103 114 110 ${stage===3?86:66}`,dark,4);
    if(type==='potato') {
      art+=leaf(110,113,.85,-65)+leaf(108,103,.7,20)+leaf(108,87,.5,-15);
      if(stage>=4) art+=line('M108 114 73 94m35 10 37-17',dark,2.5)+leaf(79,102,.7,-65)+leaf(79,95,.6,5)+leaf(138,98,.7,45)+leaf(136,90,.6,-10);
      if(stage===5) art+=blossom(106,64,1.6)+blossom(74,88,1)+ellipse(72,191,11,7,'#e2bb7c',brown,1.4)+ellipse(146,192,13,8,'#e2bb7c',brown,1.4);
    } else {
      art+=heartLeaf(109,112,.75,-55)+heartLeaf(109,94,.7,20);
      if(stage>=4) art+=line('M111 120Q68 93 50 123Q34 148 60 153Q69 146 59 141',dark,2.5)+heartLeaf(67,121,.68,-80)+heartLeaf(54,144,.48,-20);
      if(stage===5) art+=line('M110 102Q150 70 176 111Q191 135 174 151Q164 155 162 145',dark,2.5)+heartLeaf(162,99,.75,40)+heartLeaf(174,136,.6,20)+ellipse(145,190,15,7,'#ba8aa5','#a47a90',1.4);
    }
    return {art,y,faceSize};
  }
  if(type==='barley') {
    y=149;faceSize=.57;art=soil+roots(stage>=4)+ellipse(110,157,19,27,'#b8c991','#91a66d');
    art+=line('M110 146V86',dark,2.8)+longLeaf(110,142,.9,-18);
    if(stage>=4) art+=longLeaf(102,168,1.2,-52)+longLeaf(116,166,1.1,45)+longLeaf(101,167,.8,-85)+longLeaf(118,166,.8,80);
    if(stage===5) for(const x of [76,111,146]) {
      art+=line(`M110 176Q${x} 150 ${x} 105`,dark,2.4)+line(`M${x} 104V65`,'#92a56b',1.6);
      for(const v of [72,84,96]) art+=ellipse(x-5,v,5,9,'#a7b97b','#819764',1.2)+ellipse(x+5,v,5,9,'#a7b97b','#819764',1.2);
    }
    return {art,y,faceSize};
  }
  if(type==='sea-lavender') {
    y=155;faceSize=.7;art=soil+roots(stage>=4);
    const rosette=stage===3?[-45,0,45]:[-70,-35,0,35,70];
    art+=rosette.map(angle=>`<g transform="translate(110 171) rotate(${angle})">${ellipse(0,-23,15,33,'#a2b497','#7c9777',1.8)}${line('M0 0V-46','#7c9777',1)}</g>`).join('');
    art+=ellipse(110,156,28,24,'#b8c8a7','#7c9777',1.8);
    if(stage===5) art+=line('M100 139Q82 98 88 73m30 67q25-32 22-55',dark,2.5)+ellipse(88,70,10,13,'#b4a3c4','#8c7c9b')+ellipse(140,84,8,11,'#b4a3c4','#8c7c9b');
    return {art,y,faceSize};
  }
  // Young trees and vines retain their own leaf shapes, then branch before
  // the first flowers/fruit. The face sits on a pair of soft cotyledons.
  y=153;faceSize=.68;
  art=soil+roots(stage>=4)+line(`M110 177Q108 137 110 ${stage===3?102:70}`,stage===3?dark:'#9a8063',stage===3?3:4);
  if(stage===3) art+=foliage(110,115,.75,-75)+foliage(109,106,.62,25);
  else {
    art+=line('M110 132 77 99m33 20 35-25m-35 13-18-28',type==='grape'?dark:'#9a8063',2.5);
    art+=foliage(79,107,.78,-75)+foliage(140,104,.8,25)+foliage(110,84,.6,-10);
    if(type==='grape') art+=line('M110 107Q148 58 174 82Q180 98 168 101Q159 101 161 91',dark,2)+foliage(154,84,.6,30);
    if(type==='ginkgo') art+=foliage(92,151,.65,-60)+foliage(123,151,.65,30);
  }
  art+=ellipse(110,157,27,23,'#b8c998','#839d70',1.7);
  if(stage===5) {
    if(type==='ginkgo') art+=foliage(65,143,.65,-40)+foliage(143,147,.65,25);
    else if(type==='camellia'||type==='rose'||type==='magnolia') {
      const bud=type==='camellia'?'#d995a0':type==='rose'?'#e2a7ba':'#e6d6df';
      art+=line('M110 81V61','#9a8063',2.5)+path('M110 39Q93 54 101 69Q111 79 120 68Q126 51 110 39Z',bud,'#b5939f',1.6)+foliage(105,77,.4,-75);
      if(type==='camellia'||type==='rose') art+=ellipse(72,89,9,13,bud,'#b5939f',1.5);
    } else if(type==='grape') {
      art+=line('M142 100 148 111',dark,2)+[[136,120],[152,119],[163,129],[144,136],[156,145]].map(([x,v])=>circle(x,v,7,'#b5c08a','#8f9f6b',1.2)).join('');
      art+=blossom(83,96,.75);
    } else if(type==='chestnut') {
      art+=line('M77 103 75 121','#9a8063',2)+circle(75,129,13,'#a6b77a','#80965e',1.4);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;art+=line(`M${75+13*Math.cos(a)} ${129+13*Math.sin(a)}l${4*Math.cos(a)} ${4*Math.sin(a)}`,'#80965e',1.1);}
      art+=line('M138 95q8-15 9-28','#d0ca91',4);
    } else {
      art+=blossom(81,96,type==='peach'?1.25:1)+blossom(143,90,.8);
      const fruit=type==='jujube'?ellipse(136,127,8,12,'#b4c28b','#8e9e6a',1.3):circle(136,127,11,'#b4c28b','#8e9e6a',1.3);
      art+=line('M145 99 139 117','#9a8063',1.7)+fruit;
    }
  }
  return {art,y,faceSize};
}
