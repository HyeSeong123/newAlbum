// Preserve the actual installed libraries' license/NOTICE texts. No registry or
// model-rights approval is inferred from an SPDX label.
import {readFile,readdir,stat,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const roots=['@fontsource/noto-serif-kr','@sun-typeface/suit','@tauri-apps/api','@tauri-apps/plugin-dialog',
 '@tensorflow-models/coco-ssd','@tensorflow/tfjs','@tensorflow/tfjs-backend-wasm','@vladmandic/face-api',
 'lucide-react','motion','react','react-dom'];
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const packages=new Map();
async function locate(name,from=root){
 if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name))throw new Error('Invalid package name');
 let cursor=from;
 while(!relative(root,cursor).startsWith('..')){
  const candidate=resolve(cursor,'node_modules',name);
  if(await exists(join(candidate,'package.json')))return candidate;
  if(cursor===root)break;cursor=dirname(cursor);
 }
 return undefined;
}
async function collect(directory){
 if(packages.has(directory))return;
 const metadata=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
 const item={name:metadata.name,version:metadata.version,license:metadata.license||'unspecified',texts:[]};
 packages.set(directory,item);
 for(const name of (await readdir(directory)).sort()){
  if(!/^(?:licen[cs]e|copying|ofl|notice)(?:[.-].*)?$/i.test(name))continue;
  const file=join(directory,name),info=await stat(file);
  if(info.isFile()&&info.size<250_000)item.texts.push({file:name,text:await readFile(file,'utf8')});
 }
 if(!item.texts.length&&metadata.license==='Apache-2.0')
  item.texts.push({file:'Declared Apache-2.0 terms; complete license text',text:await readFile(resolve(root,'public/notices/pet-models-Apache-2.0.txt'),'utf8')});
 if(!item.texts.length&&metadata.name==='@tensorflow/tfjs-layers'&&metadata.license==='Apache-2.0 AND MIT'){
  item.texts.push({file:'tfjs-v4.22.0/tfjs-layers/LICENSE',text:await readFile(resolve(root,'public/notices/tfjs-layers-LICENSE.txt'),'utf8')});
  item.texts.push({file:'Apache-2.0 complete terms',text:await readFile(resolve(root,'public/notices/pet-models-Apache-2.0.txt'),'utf8')});
 }
 if(!item.texts.length&&metadata.name==='seedrandom'){
  const readme=await readFile(join(directory,'README.md'),'utf8');const start=readme.indexOf('Copyright 2019 David Bau.');
  if(start>=0)item.texts.push({file:'README.md license section from installed package',text:readme.slice(start)});
 }
 if(!item.texts.length&&metadata.name==='tr46'&&await exists(resolve(root,'public/notices/tr46-MIT.txt')))
  item.texts.push({file:'Upstream tr46 MIT license; package declares MIT',text:await readFile(resolve(root,'public/notices/tr46-MIT.txt'),'utf8')});
 for(const name of Object.keys(metadata.dependencies||{}).sort()){
  const dependency=await locate(name,directory);if(dependency)await collect(dependency);
 }
}
for(const name of roots){const path=await locate(name);if(!path)throw new Error('Missing browser dependency '+name);await collect(path);}
const items=[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const missing=items.filter(item=>!item.texts.length).map(item=>`${item.name}@${item.version}`);
const notice='Third-party browser library notices\nThese records preserve software notices; they do not license model weights or training data.\n\n'+
 items.map(item=>`${item.name}@${item.version}\nDeclared license: ${typeof item.license==='string'?item.license:JSON.stringify(item.license)}\n`+
  (item.texts.length?item.texts.map(text=>`--- ${text.file} ---\n${text.text}`).join('\n'):'No license text was supplied in the installed package.')).join('\n\n');
await mkdir(resolve(root,'public/notices'),{recursive:true});
await writeFile(resolve(root,'public/notices/browser-libraries.txt'),notice+'\n');
await writeFile(resolve(root,'public/notices/browser-library-inventory.json'),JSON.stringify({scope:'Installed browser library dependency notices; not native-library/model/data legal clearance',
 packages:items.map(({texts,...item})=>({...item,noticeFiles:texts.map(text=>text.file)})),missingNoticeTexts:missing},null,2)+'\n');
console.log(JSON.stringify({browserPackages:items.length,missingNoticeTexts:missing}));
