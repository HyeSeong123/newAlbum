import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const lock=JSON.parse(readFileSync(new URL('./recognition-models.lock.json',import.meta.url),'utf8'));
for(const model of lock.models){
 const file=new URL('../public/models/'+model.path,import.meta.url), bytes=readFileSync(file);
 if(bytes.length!==model.bytes || createHash('sha256').update(bytes).digest('hex')!==model.sha256)throw new Error('Unrecognized model: '+model.path);
 const root=new URL('./',file);
 for(const name of readdirSync(root))if(![file.pathname.split('/').pop(),'LICENSE'].includes(name))throw new Error('Unexpected model asset: '+name);
}
if(process.argv.includes('--commercial') && !lock.commercialClearanceConfirmed)throw new Error('Development models are installed, but commercial training-image clearance is unresolved.');
