import {mkdir,readFile,rename,rm,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

async function verified(file,spec) {
  try {
    if((await stat(file)).size!==spec.bytes)return false;
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(file))hash.update(chunk);
    return hash.digest('hex')===spec.sha256;
  }catch{return false;}
}

export async function stageGomiModel(root,spec,source,{token,fetchImpl=fetch}={}) {
  if(spec.characterId!=='gomi'||spec.usage!=='home-actions'||spec.file!=='gomi-action-v3.gguf'||
      !Number.isSafeInteger(spec.bytes)||spec.bytes<=0||!/^[0-9a-f]{64}$/.test(spec.sha256))throw Error('Invalid compact Gomi model manifest');
  const directory=join(root,'models/gomi-action-v3'),file=join(directory,spec.file);
  if(await verified(file,spec))return file;
  if(!token||!Number.isSafeInteger(source.assetId)||source.assetId<=0)throw Error('Authenticated GitHub build asset is required');
  await mkdir(directory,{recursive:true});
  const partial=file+'.part';
  try {
    let url=`https://api.github.com/repos/HyeSeong123/newAlbum/releases/assets/${source.assetId}`;
    let response;
    for(let redirects=0;redirects<4;redirects++) {
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||!['api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))throw Error('Unexpected model redirect destination');
      const headers={Accept:'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'};
      if(parsed.hostname==='api.github.com')headers.Authorization='Bearer '+token;
      response=await fetchImpl(url,{headers,redirect:'manual'});
      if([301,302,303,307,308].includes(response.status)) {
        const target=response.headers.get('location');
        if(!target)throw Error('Missing model redirect location');
        url=new URL(target,url).href;
        response=undefined;
        continue;
      }
      break;
    }
    if(!response?.ok||!response.body)throw Error(`Model download failed (HTTP ${response?.status ?? 'redirect limit'}); check GitHub draft artifact access`);
    let bytes=0;
    const hash=createHash('sha256');
    const proof=new Transform({transform(chunk,encoding,callback){
      bytes+=chunk.length;
      if(bytes>spec.bytes){callback(Error('Model size exceeds manifest'));return;}
      hash.update(chunk);callback(null,chunk);
    }});
    await pipeline(Readable.fromWeb(response.body),proof,createWriteStream(partial,{flags:'wx'}));
    if(bytes!==spec.bytes||hash.digest('hex')!==spec.sha256)throw Error('Model integrity or size does not match manifest');
    await rename(partial,file);
    return file;
  }finally{await rm(partial,{force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const folder=join(root,'models/gomi-action-v3');
  try{
    const spec=JSON.parse(await readFile(join(folder,'runtime.json'),'utf8'));
    const source=JSON.parse(await readFile(join(folder,'build-source.json'),'utf8'));
    await stageGomiModel(root,spec,source,{token:process.env.GH_TOKEN});
    console.log('Verified compact Gomi model staged for APK packaging.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
